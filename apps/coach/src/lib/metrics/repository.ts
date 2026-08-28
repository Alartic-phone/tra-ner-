import { prisma } from "../db.ts";
import { loadStreams } from "../streams.ts";
import { addDays, type Day } from "../shifts/day.ts";
import { today } from "../time.ts";
import {
  DEFAULT_DURATIONS,
  bestDistanceForDurations,
  mergeBestEfforts,
} from "./best-efforts.ts";
import { computeDecoupling } from "./decoupling.ts";
import { computeGap } from "./gap.ts";
import {
  computeAcwr,
  computeFitnessSeries,
  computeFoster,
  toDailyLoads,
  type FitnessPoint,
} from "./load.ts";
import {
  trimpFromAverage,
  trimpFromRpe,
  trimpFromStream,
  type HeartRateProfile,
  type TrimpMethod,
} from "./trimp.ts";
import { computeHeartRateZones, computePaceZones, timeInZones } from "./zones.ts";

/**
 * Pont entre la base et le moteur de calcul. Le moteur reste pur : c'est ici
 * qu'on lit, qu'on écrit, et qu'on assume les cas où une donnée manque.
 */

export type ProfileStatus = {
  profile: HeartRateProfile | null;
  vmaKmh: number | null;
  /** Ce qui manque pour calculer la charge. Affiché tel quel dans l'interface. */
  missing: string[];
};

export async function getProfileStatus(): Promise<ProfileStatus> {
  const user = await prisma.user.findFirst();
  const missing: string[] = [];

  if (!user) {
    return {
      profile: null,
      vmaKmh: null,
      missing: ["Le profil n'est pas encore renseigné."],
    };
  }
  if (user.hrMax == null) missing.push("fréquence cardiaque maximale");
  if (user.hrRest == null) missing.push("fréquence cardiaque de repos");
  if (user.sex == null) missing.push("sexe (coefficient de Banister)");

  const profile =
    user.hrMax != null && user.hrRest != null && (user.sex === "M" || user.sex === "F")
      ? { hrMax: user.hrMax, hrRest: user.hrRest, sex: user.sex }
      : null;

  return { profile, vmaKmh: user.vma ?? null, missing };
}

export type ActivityMetrics = {
  trimp: number | null;
  trimpMethod: TrimpMethod | null;
  gapPaceSPerKm: number | null;
  decouplingPct: number | null;
  bestEfforts: Array<{ durationS: number; distanceM: number }>;
};

/**
 * Calcule toutes les métriques dérivées d'une activité.
 *
 * L'ordre de préférence pour la charge est explicite et tracé : flux cardiaque
 * seconde par seconde, sinon fréquence cardiaque moyenne, sinon RPE du
 * journal. Si aucune de ces sources n'existe, la charge reste NULLE — jamais
 * remplacée par une valeur d'apparence plausible.
 */
export async function computeActivityMetrics(
  activityId: string,
  profile: HeartRateProfile | null,
): Promise<ActivityMetrics> {
  const activity = await prisma.activity.findUnique({ where: { id: activityId } });
  if (!activity) {
    return {
      trimp: null,
      trimpMethod: null,
      gapPaceSPerKm: null,
      decouplingPct: null,
      bestEfforts: [],
    };
  }

  const streams = await loadStreams(activityId);

  let trimp: number | null = null;
  let trimpMethod: TrimpMethod | null = null;

  if (profile && streams?.heartrate && streams.time) {
    const result = trimpFromStream(streams.heartrate, streams.time, profile);
    if (result) {
      trimp = result.trimp;
      trimpMethod = "banister_stream";
    }
  }

  if (trimp === null && profile && activity.avgHr != null) {
    trimp = trimpFromAverage(activity.avgHr, activity.movingTimeS, profile);
    trimpMethod = "banister_average";
  }

  if (trimp === null) {
    // Dernier recours : le RPE saisi au journal le jour même.
    const journal = await prisma.journalEntry.findUnique({
      where: { day: activity.startDay },
      select: { rpe: true },
    });
    if (journal?.rpe != null) {
      trimp = trimpFromRpe(journal.rpe, activity.movingTimeS);
      trimpMethod = "rpe_foster";
    }
  }

  const gap =
    streams?.distance && streams.altitude && streams.time
      ? computeGap(streams.distance, streams.altitude, streams.time)
      : null;

  const decoupling =
    streams?.velocity_smooth && streams.heartrate && streams.time
      ? computeDecoupling(streams.velocity_smooth, streams.heartrate, streams.time)
      : null;

  const bestEfforts =
    streams?.distance && streams.time
      ? bestDistanceForDurations(
          { time: streams.time, distance: streams.distance },
          DEFAULT_DURATIONS,
        )
      : [];

  return {
    trimp,
    trimpMethod,
    gapPaceSPerKm: gap?.gapSPerKm ?? null,
    decouplingPct: decoupling?.decouplingPct ?? null,
    bestEfforts,
  };
}

/** Calcule et persiste les métriques d'une activité. */
export async function persistActivityMetrics(
  activityId: string,
  profile: HeartRateProfile | null,
): Promise<void> {
  const metrics = await computeActivityMetrics(activityId, profile);

  await prisma.activity.update({
    where: { id: activityId },
    data: {
      trimp: metrics.trimp,
      trimpMethod: metrics.trimpMethod,
      gapPaceSPerKm: metrics.gapPaceSPerKm,
      gapEstimated: true,
      decouplingPct: metrics.decouplingPct,
      metricsComputedAt: new Date(),
    },
  });

  if (metrics.bestEfforts.length > 0) {
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      select: { startDay: true },
    });
    await prisma.bestEffort.deleteMany({ where: { activityId } });
    await prisma.bestEffort.createMany({
      data: metrics.bestEfforts.map((e) => ({
        activityId,
        durationS: e.durationS,
        distanceM: e.distanceM,
        day: activity?.startDay ?? "",
      })),
    });
  }
}

export type RecomputeReport = { processed: number; skipped: number; total: number };

/**
 * Recalcule les métriques des activités qui en ont besoin.
 *
 * Borné par un budget de temps : sur plusieurs années d'historique, la
 * décompression de tous les flux prend plusieurs minutes et ne doit pas
 * bloquer une requête HTTP. Le champ `metricsComputedAt` permet de reprendre
 * exactement où le traitement s'est arrêté.
 */
export async function recomputeMetrics(
  options: { force?: boolean; budgetMs?: number; limit?: number } = {},
): Promise<RecomputeReport> {
  const budgetMs = options.budgetMs ?? 20_000;
  const limit = options.limit ?? 500;
  const startedAt = Date.now();

  const { profile } = await getProfileStatus();

  const where = options.force ? {} : { metricsComputedAt: null };
  const total = await prisma.activity.count({ where });
  const activities = await prisma.activity.findMany({
    where,
    select: { id: true },
    orderBy: { startedAt: "desc" },
    take: limit,
  });

  let processed = 0;
  for (const activity of activities) {
    if (Date.now() - startedAt > budgetMs) break;
    await persistActivityMetrics(activity.id, profile);
    processed += 1;
  }

  return { processed, skipped: total - processed, total };
}

// ---------------------------------------------------------------------------
// Séries agrégées
// ---------------------------------------------------------------------------

export type FitnessSnapshot = {
  series: FitnessPoint[];
  current: FitnessPoint | null;
  acwr: ReturnType<typeof computeAcwr>;
  /** Ratio aigu/chronique jour par jour, pour suivre son évolution. */
  acwrSeries: Array<{ day: Day; ratio: number | null }>;
  foster: ReturnType<typeof computeFoster>;
  /** Nombre d'activités dont la charge n'a pas pu être calculée. */
  activitiesWithoutLoad: number;
  profileMissing: string[];
};

/**
 * État de forme à une date donnée.
 *
 * La série démarre volontairement bien avant la fenêtre affichée : la CTL est
 * une moyenne mobile à 42 jours, l'amorcer au premier jour affiché la ferait
 * partir de zéro et produirait une courbe fausse sur les six premières
 * semaines.
 */
export async function loadFitnessSnapshot(
  from: Day,
  to: Day = today(),
): Promise<FitnessSnapshot> {
  // 120 jours d'amorçage avant la fenêtre demandée, soit près de trois
  // constantes de temps de CTL.
  const warmupFrom = addDays(from, -120);

  const [activities, missingLoad, { missing }] = await Promise.all([
    prisma.activity.findMany({
      where: { startDay: { gte: warmupFrom, lte: to } },
      select: { startDay: true, trimp: true },
    }),
    prisma.activity.count({
      where: { startDay: { gte: from, lte: to }, trimp: null },
    }),
    getProfileStatus(),
  ]);

  const loads = toDailyLoads(
    activities.map((a) => ({ day: a.startDay, load: a.trimp })),
    warmupFrom,
    to,
  );

  const full = computeFitnessSeries(loads);
  const series = full.filter((p) => p.day >= from);

  return {
    series,
    current: full[full.length - 1] ?? null,
    acwr: computeAcwr(loads, to),
    acwrSeries: series.map((p) => ({ day: p.day, ratio: computeAcwr(loads, p.day).ratio })),
    foster: computeFoster(loads, to),
    activitiesWithoutLoad: missingLoad,
    profileMissing: missing,
  };
}

export type ZoneDistribution = {
  zones: Array<{ index: number; name: string; seconds: number; fromBpm: number; toBpm: number }>;
  belowZone1Seconds: number;
  unmeasuredSeconds: number;
  /** Activités sans flux cardiaque, donc absentes de cette répartition. */
  activitiesWithoutHr: number;
};

/**
 * Répartition du temps par zone de fréquence cardiaque sur une période.
 *
 * Les activités sans cardio ne sont PAS réparties au prorata : elles sont
 * comptées à part et signalées. Les diluer dans les zones donnerait une
 * polarisation inventée.
 */
export async function loadZoneDistribution(
  from: Day,
  to: Day,
): Promise<ZoneDistribution | null> {
  const { profile } = await getProfileStatus();
  if (!profile) return null;

  const zones = computeHeartRateZones(profile.hrMax, profile.hrRest);
  const activities = await prisma.activity.findMany({
    where: { startDay: { gte: from, lte: to } },
    select: { id: true, hasStreams: true },
  });

  const totals = new Map<number, number>(zones.map((z) => [z.index, 0]));
  let belowZone1 = 0;
  let unmeasured = 0;
  let withoutHr = 0;

  for (const activity of activities) {
    const streams = activity.hasStreams ? await loadStreams(activity.id) : null;
    if (!streams?.heartrate || !streams.time) {
      withoutHr += 1;
      continue;
    }
    const result = timeInZones(streams.heartrate, streams.time, zones);
    for (const [index, seconds] of result.byZone) {
      totals.set(index, (totals.get(index) ?? 0) + seconds);
    }
    belowZone1 += result.belowZone1;
    unmeasured += result.unmeasured;
  }

  return {
    zones: zones.map((z) => ({
      index: z.index,
      name: z.name,
      seconds: totals.get(z.index) ?? 0,
      fromBpm: z.fromBpm,
      toBpm: z.toBpm,
    })),
    belowZone1Seconds: belowZone1,
    unmeasuredSeconds: unmeasured,
    activitiesWithoutHr: withoutHr,
  };
}

/** Meilleurs efforts consolidés sur une période, pour la vitesse critique. */
export async function loadBestEfforts(from: Day, to: Day) {
  const rows = await prisma.bestEffort.findMany({
    where: { day: { gte: from, lte: to } },
    select: { durationS: true, distanceM: true },
  });
  return mergeBestEfforts(rows);
}

/** Zones d'allure dérivées de la VMA saisie. */
export async function loadPaceZones() {
  const { vmaKmh } = await getProfileStatus();
  return vmaKmh ? computePaceZones(vmaKmh) : null;
}
