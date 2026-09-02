import { prisma } from "../db.ts";
import { loadStreams } from "../streams.ts";
import { isRun, RUN_TYPES } from "../strava/mapping.ts";
import { addDays, type Day } from "../shifts/day.ts";
import { today } from "../time.ts";
import {
  DEFAULT_DURATIONS,
  bestDistanceForDurations,
  detectPersonalRecords,
  mergeBestEfforts,
} from "./best-efforts.ts";
import { computeDecoupling } from "./decoupling.ts";
import { computeGap } from "./gap.ts";
import { longestRunProgression } from "./records.ts";
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
  type Sex,
  type TrimpMethod,
} from "./trimp.ts";
import { computeHeartRateZones, computePaceZones, timeInZones } from "./zones.ts";
import { buildPrediction, estimatesForDistance, type Prediction } from "./prediction.ts";
import {
  computeReadiness,
  findLatestReadinessMeasurement,
  type ReadinessResult,
} from "./readiness.ts";

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

  const sex: Sex | null = user.sex === "M" || user.sex === "F" ? user.sex : null;
  const profile: HeartRateProfile | null =
    user.hrMax != null && user.hrRest != null && sex != null
      ? { hrMax: user.hrMax, hrRest: user.hrRest, sex }
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

  // GAP, découplage et meilleurs efforts sont des modèles de course à pied
  // (coût de Minetti, Pa:Hr, vitesse critique) : les appliquer à un vélo ou
  // une randonnée produirait des vitesses de série totalement différentes
  // (un vélo à 55 km/h n'est pas un "meilleur effort" de course) et
  // corromprait silencieusement la vitesse critique et les prédictions.
  const isRunningActivity = isRun(activity.type);

  const gap =
    isRunningActivity && streams?.distance && streams.altitude && streams.time
      ? computeGap(streams.distance, streams.altitude, streams.time)
      : null;

  const decoupling =
    isRunningActivity && streams?.velocity_smooth && streams.heartrate && streams.time
      ? computeDecoupling(streams.velocity_smooth, streams.heartrate, streams.time)
      : null;

  const bestEfforts =
    isRunningActivity && streams?.distance && streams.time
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

  // Purge inconditionnelle : si l'activité n'est plus éligible aux meilleurs
  // efforts (ex. un vélo dont le type a été corrigé, ou le passage du filtre
  // course-à-pied introduit ensuite), d'anciennes lignes ne doivent pas
  // survivre simplement parce que la nouvelle liste est vide.
  await prisma.bestEffort.deleteMany({ where: { activityId } });
  if (metrics.bestEfforts.length > 0) {
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      select: { startDay: true },
    });
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

/**
 * Répartition par zone FC, séance par séance — la barre de zone des cartes
 * d'activité. `null` par activité sans profil ou sans cardio : jamais une
 * barre inventée.
 */
export async function loadZoneSecondsByActivity(
  activityIds: readonly string[],
): Promise<Map<string, number[] | null>> {
  const { profile } = await getProfileStatus();
  const out = new Map<string, number[] | null>();
  if (!profile || activityIds.length === 0) {
    for (const id of activityIds) out.set(id, null);
    return out;
  }

  const zones = computeHeartRateZones(profile.hrMax, profile.hrRest);
  await Promise.all(
    activityIds.map(async (id) => {
      const streams = await loadStreams(id);
      if (!streams?.heartrate || !streams.time) {
        out.set(id, null);
        return;
      }
      const result = timeInZones(streams.heartrate, streams.time, zones);
      out.set(
        id,
        zones.map((z) => result.byZone.get(z.index) ?? 0),
      );
    }),
  );
  return out;
}

/** Meilleurs efforts consolidés sur une période, pour la vitesse critique. */
export async function loadBestEfforts(from: Day, to: Day) {
  const rows = await prisma.bestEffort.findMany({
    where: { day: { gte: from, lte: to } },
    select: { durationS: true, distanceM: true },
  });
  return mergeBestEfforts(rows);
}

/**
 * Durées pour lesquelles cette activité égale ou bat le record all-time —
 * `BestEffort` ne contient déjà que de la course à pied (cf. filtre par
 * type dans `computeActivityMetrics`), pas de filtre supplémentaire à faire.
 */
export async function loadPersonalRecords(activityId: string): Promise<number[]> {
  const [current, allTime] = await Promise.all([
    prisma.bestEffort.findMany({
      where: { activityId },
      select: { durationS: true, distanceM: true },
    }),
    prisma.bestEffort.groupBy({ by: ["durationS"], _max: { distanceM: true } }),
  ]);
  if (current.length === 0) return [];

  const allTimeBest = new Map(allTime.map((row) => [row.durationS, row._max.distanceM ?? 0]));
  return detectPersonalRecords(current, allTimeBest);
}

/**
 * Même chose que `loadPersonalRecords`, mais pour une liste (carte
 * d'activité) : deux requêtes au total plutôt que deux par activité.
 */
export async function loadPersonalRecordsByActivity(
  activityIds: readonly string[],
): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  if (activityIds.length === 0) return out;

  const [rows, allTime] = await Promise.all([
    prisma.bestEffort.findMany({
      where: { activityId: { in: [...activityIds] } },
      select: { activityId: true, durationS: true, distanceM: true },
    }),
    prisma.bestEffort.groupBy({ by: ["durationS"], _max: { distanceM: true } }),
  ]);

  const allTimeBest = new Map(allTime.map((row) => [row.durationS, row._max.distanceM ?? 0]));
  const byActivity = new Map<string, { durationS: number; distanceM: number }[]>();
  for (const row of rows) {
    const list = byActivity.get(row.activityId) ?? [];
    list.push({ durationS: row.durationS, distanceM: row.distanceM });
    byActivity.set(row.activityId, list);
  }
  for (const id of activityIds) {
    out.set(id, detectPersonalRecords(byActivity.get(id) ?? [], allTimeBest));
  }
  return out;
}

/**
 * Prédiction de chrono sur une distance, à partir des meilleurs efforts
 * réels de la période. `null` si aucun effort de référence n'existe —
 * jamais une estimation construite sur du vide.
 */
export async function predictDistance(
  distanceM: number,
  from: Day,
  to: Day,
): Promise<Prediction | null> {
  const efforts = await loadBestEfforts(from, to);
  if (efforts.length === 0) return null;
  return buildPrediction(distanceM, estimatesForDistance(distanceM, efforts), {
    sourceAgeDays: null,
    sampleCount: efforts.length,
  });
}

/** Zones d'allure dérivées de la VMA saisie. */
export async function loadPaceZones() {
  const { vmaKmh } = await getProfileStatus();
  return vmaKmh ? computePaceZones(vmaKmh) : null;
}

/**
 * Fraîcheur du jour, pour la bannière du tableau de bord. `null` seulement si
 * aucune mesure complète (VFC + FC de repos) n'existe dans la fenêtre, ou si
 * elle n'a pas 7 jours DISPONIBLES antérieurs pour établir une plage
 * habituelle — jamais un statut affiché sur une base insuffisante.
 *
 * Si la mesure du jour n'existe pas encore (avant le réveil, en sortie de
 * poste, capteur pas encore synchronisé), on remonte à la dernière mesure
 * complète disponible plutôt que de perdre l'information : `measurementDay`
 * porte sa date, et `isToday` dit si c'est bien celle du jour demandé.
 */
export async function loadReadiness(
  day: Day,
): Promise<
  { result: ReadinessResult; hrv: number; restingHr: number; measurementDay: Day; isToday: boolean } | null
> {
  const LOOKBACK_DAYS = 60;

  const history = await prisma.healthMetric.findMany({
    where: { day: { gte: addDays(day, -LOOKBACK_DAYS), lte: day } },
    orderBy: { day: "desc" },
    select: { day: true, hrv: true, restingHr: true },
  });

  const measurement = findLatestReadinessMeasurement(history);
  if (!measurement) return null;

  const result = computeReadiness({
    hrv: measurement.hrv,
    restingHr: measurement.restingHr,
    hrvBaselineMean: measurement.hrvBaseline.mean,
    hrvBaselineSd: measurement.hrvBaseline.sd,
    restingHrBaselineMean: measurement.restingHrBaseline.mean,
  });

  return {
    result,
    hrv: measurement.hrv,
    restingHr: measurement.restingHr,
    measurementDay: measurement.measurementDay,
    isToday: measurement.measurementDay === day,
  };
}

/** La séance planifiée du jour, si un plan actif en propose une. */
export async function loadTodaysWorkout(day: Day) {
  return prisma.plannedWorkout.findFirst({
    where: { day, plan: { status: "active" } },
    orderBy: { orderInDay: "asc" },
    include: { activity: { select: { id: true } } },
  });
}

/**
 * Volume hebdomadaire cible de la phase de plan en cours, si un plan actif
 * en propose une pour cette semaine. `null` sans plan, ou si la phase active
 * n'a pas chiffré de volume — jamais une cible inventée par défaut.
 */
export async function loadWeeklyVolumeTargetKm(day: Day): Promise<number | null> {
  const plan = await prisma.trainingPlan.findFirst({
    where: { status: "active", startDay: { lte: day }, endDay: { gte: day } },
    select: { phasesJson: true },
  });
  if (!plan) return null;

  const phases = JSON.parse(plan.phasesJson) as Array<{
    startDay: string;
    endDay: string;
    weeklyVolumeKm?: number;
  }>;
  const active = phases.find((p) => p.startDay <= day && day <= p.endDay);
  return active?.weeklyVolumeKm ?? null;
}

/** Objectif actif le plus proche dans le temps, pour le compte à rebours. */
export async function loadNextGoal() {
  return prisma.goal.findFirst({
    where: { isActive: true, day: { gte: today() } },
    orderBy: { day: "asc" },
  });
}

/**
 * Progression du record de distance en course à pied dans le temps : pour
 * chaque activité qui a battu le record du moment, sa distance et sa date.
 * Sert à la barre de progression des records du tableau de bord — jamais un
 * record affiché s'il n'a pas réellement été battu par une activité.
 */
export async function loadLongestRunProgression(): Promise<
  { day: Day; distanceM: number }[]
> {
  const runs = await prisma.activity.findMany({
    where: { type: { in: [...RUN_TYPES] } },
    orderBy: { startDay: "asc" },
    select: { startDay: true, distanceM: true },
  });

  return longestRunProgression(runs.map((r) => ({ day: r.startDay, distanceM: r.distanceM })));
}
