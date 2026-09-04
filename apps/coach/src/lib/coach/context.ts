import { z } from "zod";
import { prisma } from "../db.ts";
import { getAvailabilityRules } from "../settings.ts";
import { today } from "../time.ts";
import { addDays, diffDays, type Day } from "../shifts/day.ts";
import { loadReplacementStats, loadShiftRange, type ShiftRange } from "../shifts/repository.ts";
import type { ReplacementStats } from "../shifts/cycle.ts";
import { computeAcwr, toDailyLoads, computeFitnessSeries, acwrZone, type AcwrZone } from "../metrics/load.ts";
import { getProfileStatus, predictDistance } from "../metrics/repository.ts";
import type { HeartRateProfile } from "../metrics/trimp.ts";
import { computeHeartRateZones, computePaceZones, type HeartRateZone, type PaceZone } from "../metrics/zones.ts";
import type { Prediction } from "../metrics/prediction.ts";

/**
 * Assemble tout ce dont la génération de plan a besoin, sans rien recalculer
 * soi-même : chaque valeur vient du moteur qui la produit déjà ailleurs dans
 * l'application. Toute donnée absente reste `null` et vient enrichir
 * `dataCompleteness`, transmis au modèle ET affiché dans l'interface — jamais
 * comblée par une estimation.
 */

export type GoalInfo = {
  id: string;
  name: string;
  day: Day;
  distanceM: number;
  targetTimeMinS: number | null;
  targetTimeMaxS: number | null;
  floorTimeS: number | null;
  priority: string;
};

export type FitnessInfo = {
  ctl: number;
  atl: number;
  tsb: number;
  reliable: boolean;
  acwr: number | null;
  acwrZone: AcwrZone;
};

export type CoachContext = {
  today: Day;
  goal: GoalInfo;
  weeksUntilGoal: number;
  profile: HeartRateProfile | null;
  vmaKmh: number | null;
  hrZones: HeartRateZone[] | null;
  paceZones: PaceZone[] | null;
  fitness: FitnessInfo | null;
  prediction: Prediction | null;
  shiftRange: ShiftRange;
  replacementStats: ReplacementStats;
  injuryFlag: boolean;
  injuryNotes: string[];
  dataCompleteness: string[];
};

const painEntrySchema = z.object({
  zone: z.string(),
  intensity: z.number().min(1).max(10),
  since: z.string().optional(),
});

/**
 * Douleur élevée (intensité >= 7) ou persistante (même zone rapportée au
 * moins 3 fois sur les 7 derniers jours) : le contexte le signale, à charge
 * pour le prompt et pour `checkGuardrails` d'en tenir compte. Jamais de
 * diagnostic ici, uniquement un repérage factuel.
 */
async function detectInjuryFlag(fromDay: Day): Promise<{ flag: boolean; notes: string[] }> {
  const entries = await prisma.journalEntry.findMany({
    where: { day: { gte: fromDay } },
    select: { day: true, painsJson: true },
    orderBy: { day: "asc" },
  });

  const notes: string[] = [];
  const zoneCounts = new Map<string, number>();
  let highIntensity = false;

  for (const entry of entries) {
    let pains: Array<z.infer<typeof painEntrySchema>>;
    try {
      const parsed = z.array(painEntrySchema).safeParse(JSON.parse(entry.painsJson));
      pains = parsed.success ? parsed.data : [];
    } catch {
      pains = [];
    }
    for (const pain of pains) {
      if (pain.intensity >= 7) {
        highIntensity = true;
        notes.push(`Douleur ${pain.zone} d'intensité ${pain.intensity}/10 le ${entry.day}.`);
      }
      zoneCounts.set(pain.zone, (zoneCounts.get(pain.zone) ?? 0) + 1);
    }
  }

  const persistent = [...zoneCounts.entries()].filter(([, count]) => count >= 3);
  for (const [zone, count] of persistent) {
    notes.push(`Douleur ${zone} rapportée ${count} fois sur les 7 derniers jours.`);
  }

  return { flag: highIntensity || persistent.length > 0, notes };
}

export async function buildCoachContext(goalId: string): Promise<CoachContext> {
  const now = today();
  const dataCompleteness: string[] = [];

  const goalRow = await prisma.goal.findUniqueOrThrow({ where: { id: goalId } });
  const goal: GoalInfo = {
    id: goalRow.id,
    name: goalRow.name,
    day: goalRow.day,
    distanceM: goalRow.distanceM,
    targetTimeMinS: goalRow.targetTimeMinS,
    targetTimeMaxS: goalRow.targetTimeMaxS,
    floorTimeS: goalRow.floorTimeS,
    priority: goalRow.priority,
  };

  const weeksUntilGoal = Math.max(1, Math.round(diffDays(now, goal.day) / 7));

  const [profileStatus, rules, replacementStats, injury] = await Promise.all([
    getProfileStatus(),
    getAvailabilityRules(),
    loadReplacementStats(now, goal.day),
    detectInjuryFlag(addDays(now, -7)),
  ]);

  if (profileStatus.missing.length > 0) {
    dataCompleteness.push(...profileStatus.missing.map((m) => `Profil : ${m} non disponible.`));
  }

  const hrZones =
    profileStatus.thresholdHr != null
      ? computeHeartRateZones(profileStatus.thresholdHr, profileStatus.profile?.hrMax ?? null)
      : null;
  const paceZones = profileStatus.vmaKmh ? computePaceZones(profileStatus.vmaKmh) : null;
  if (!paceZones) dataCompleteness.push("VMA non renseignée : zones d'allure non disponibles.");

  const shiftRange = await loadShiftRange(now, goal.day, rules);

  // Fenêtre large pour amorcer CTL/ATL (cf. loadFitnessSnapshot) : 120 jours
  // avant aujourd'hui, jusqu'à aujourd'hui inclus.
  const warmupFrom = addDays(now, -120);
  const activities = await prisma.activity.findMany({
    where: { startDay: { gte: warmupFrom, lte: now } },
    select: { startDay: true, trimp: true },
  });
  let fitness: FitnessInfo | null = null;
  if (activities.length === 0) {
    dataCompleteness.push("Aucune activité importée : charge d'entraînement (CTL/ATL/ACWR) non disponible.");
  } else {
    const loads = toDailyLoads(
      activities.map((a) => ({ day: a.startDay, load: a.trimp })),
      warmupFrom,
      now,
    );
    const series = computeFitnessSeries(loads);
    const current = series[series.length - 1] ?? null;
    // Première activité connue dans la fenêtre d'amorçage : sert à distinguer
    // un vrai jour de repos d'un jour antérieur au suivi (cf. computeAcwr).
    const historyStartDay = activities.reduce<Day | null>(
      (min, a) => (min == null || a.startDay < min ? a.startDay : min),
      null,
    );
    const acwr = computeAcwr(loads, now, { historyStartDay });
    if (current) {
      fitness = {
        ctl: current.ctl,
        atl: current.atl,
        tsb: current.tsb,
        reliable: current.reliable,
        acwr: acwr.ratio,
        acwrZone: acwrZone(acwr.ratio),
      };
      if (!current.reliable) {
        dataCompleteness.push(
          "Historique de charge trop court (< 42 jours) : condition physique (CTL) peu fiable.",
        );
      }
    }
  }

  // Prédiction sur la distance de l'objectif à partir des meilleurs efforts
  // existants — composition partagée avec le simulateur (`metrics/repository.ts`).
  const prediction: Prediction | null = await predictDistance(goal.distanceM, warmupFrom, now);
  if (!prediction) {
    dataCompleteness.push("Aucun meilleur effort disponible : pas de prédiction de chrono mesurée.");
  }

  return {
    today: now,
    goal,
    weeksUntilGoal,
    profile: profileStatus.profile,
    vmaKmh: profileStatus.vmaKmh,
    hrZones,
    paceZones,
    fitness,
    prediction,
    shiftRange,
    replacementStats,
    injuryFlag: injury.flag,
    injuryNotes: injury.notes,
    dataCompleteness,
  };
}
