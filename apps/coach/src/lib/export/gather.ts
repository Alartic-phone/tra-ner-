import { prisma } from "../db.ts";
import { addDays, eachDay, mondayOf, type Day } from "../shifts/day.ts";
import { getAvailabilityRules } from "../settings.ts";
import { loadShiftRange, loadReplacementStats } from "../shifts/repository.ts";
import { isRun } from "../strava/mapping.ts";
import {
  getProfileStatus,
  loadBestEfforts,
  loadBestKilometer,
  loadFitnessSnapshot,
  loadLongestRunProgression,
  loadNextGoal,
  loadPaceZones,
  loadRecordWeek,
  loadZoneSecondsByActivity,
} from "../metrics/repository.ts";
import { computeHeartRateZones } from "../metrics/zones.ts";
import { today } from "../time.ts";
import { EXPORT_SCHEMA_VERSION, type ExportData } from "./schema.ts";

export type ExportScope = "7j" | "30j" | "90j" | "tout" | "personnalise";

export type ExportOptions = {
  from: Day;
  to: Day;
  scope: ExportScope;
  /** "aucune" | "plus_45min" | "toutes" — quelles activités reçoivent splits/laps/bestEfforts détaillés. */
  activityDetail: "aucune" | "plus_45min" | "toutes";
};

/**
 * Rassemble toutes les données d'une période dans la forme unique qui
 * alimente les trois formats d'export (Markdown, JSON, CSV) — un seul
 * endroit qui lit la base, jamais trois requêtes divergentes pour trois
 * formats qui devraient dire la même chose.
 */
export async function gatherExportData(options: ExportOptions): Promise<ExportData> {
  const { from, to } = options;
  const rules = await getAvailabilityRules();

  const [user, shiftRange, replacementStats, activities, healthRows, nextGoal, plannedWorkouts, profileStatus, paceZones] =
    await Promise.all([
      prisma.user.findFirst(),
      loadShiftRange(from, to, rules),
      loadReplacementStats(from, to),
      prisma.activity.findMany({
        where: { startDay: { gte: from, lte: to } },
        orderBy: { startedAt: "asc" },
        include: { laps: { orderBy: { lapIndex: "asc" } }, bestEfforts: true },
      }),
      prisma.healthMetric.findMany({ where: { day: { gte: from, lte: to } } }),
      loadNextGoal(),
      prisma.plannedWorkout.findMany({
        where: { day: { gte: from, lte: to } },
        include: { activity: { select: { id: true } } },
      }),
      getProfileStatus(),
      loadPaceZones(),
    ]);

  const hrZones =
    profileStatus.thresholdHr != null
      ? computeHeartRateZones(profileStatus.thresholdHr, profileStatus.profile?.hrMax ?? null)
      : null;

  // -- Profil ---------------------------------------------------------------
  const profile: ExportData["profile"] = {
    firstName: user?.firstName ?? null,
    hrMax: user?.hrMax ?? null,
    hrRest: user?.hrRest ?? null,
    sex: user?.sex ?? null,
    weightKg: user?.weightKg ?? null,
    vma: user?.vma ?? null,
    hrZones: hrZones?.map((z) => ({ index: z.index, name: z.name, fromBpm: z.fromBpm, toBpm: z.toBpm })) ?? null,
    paceZones: paceZones ?? null,
  };

  // -- Postes -----------------------------------------------------------------
  const exceptionRows = await prisma.shiftException.findMany({ where: { day: { gte: from, lte: to } } });
  const shifts: ExportData["shifts"] = {
    cycleAnchorDay: shiftRange.cycle.anchorDay,
    blocks: shiftRange.cycle.blocks,
    days: shiftRange.days.map((d) => ({
      day: d.day,
      code: d.code,
      label: d.code ? (shiftRange.timings.find((t) => t.code === d.code)?.label ?? d.code) : "Repos",
      isException: d.isException,
      isReplacement: d.isReplacement,
    })),
    replacements: exceptionRows.map((e) => ({ day: e.day, code: e.code, note: e.note })),
  };

  // -- Activités --------------------------------------------------------------
  const activityIds = activities.map((a) => a.id);
  const zonesByActivity = await loadZoneSecondsByActivity(activityIds);

  const exportActivities: ExportData["activities"] = activities.map((a) => ({
    id: a.id,
    day: a.startDay,
    name: a.name,
    type: a.type,
    distanceM: a.distanceM,
    movingTimeS: a.movingTimeS,
    elevationGainM: a.elevationGainM,
    avgHr: a.avgHr,
    maxHr: a.maxHr,
    avgSpeedMps: a.avgSpeedMps,
    trimp: a.trimp,
    trimpEstimated: a.trimp != null,
    gapPaceSPerKm: a.gapPaceSPerKm,
    gapEstimated: a.gapEstimated,
    decouplingPct: a.decouplingPct,
    hasStreams: a.hasStreams,
    hasHeartrate: a.hasHeartrate,
  }));

  const detailEligible = activities.filter((a) => {
    if (options.activityDetail === "aucune") return false;
    if (options.activityDetail === "toutes") return true;
    return a.movingTimeS >= 45 * 60;
  });
  const activityDetails: ExportData["activityDetails"] = detailEligible.map((a) => ({
    activityId: a.id,
    splits: a.laps
      .filter((l) => l.splitIndex != null)
      .map((l) => ({ index: l.splitIndex!, distanceM: l.distanceM, movingTimeS: l.movingTimeS, avgHr: l.avgHr })),
    laps: a.laps
      .filter((l) => l.splitIndex == null)
      .map((l) => ({ index: l.lapIndex, distanceM: l.distanceM, movingTimeS: l.movingTimeS, avgHr: l.avgHr, isManual: l.isManual })),
    zoneSecondsByZone: zonesByActivity.get(a.id) ?? null,
    bestEfforts: a.bestEfforts.map((e) => ({ durationS: e.durationS, distanceM: e.distanceM })),
  }));

  // -- Semaines -----------------------------------------------------------------
  const weekStarts: Day[] = [];
  {
    let cursor = mondayOf(from);
    const last = mondayOf(to);
    while (cursor <= last) {
      weekStarts.push(cursor);
      cursor = addDays(cursor, 7);
    }
  }
  const fitness = await loadFitnessSnapshot(from, to);
  const fitnessByDay = new Map(fitness.series.map((p) => [p.day, p]));

  const weeks: ExportData["weeks"] = weekStarts.map((weekStart) => {
    const weekEnd = addDays(weekStart, 6);
    const inWeek = activities.filter((a) => a.startDay >= weekStart && a.startDay <= weekEnd);
    const runKm = inWeek.filter((a) => isRun(a.type)).reduce((s, a) => s + a.distanceM, 0) / 1000;
    const rideKm = inWeek.filter((a) => /ride|bike|cycl/i.test(a.type)).reduce((s, a) => s + a.distanceM, 0) / 1000;
    const elevationM = inWeek.reduce((s, a) => s + (a.elevationGainM ?? 0), 0);
    const durationS = inWeek.reduce((s, a) => s + a.movingTimeS, 0);
    const trimpValues = inWeek.map((a) => a.trimp).filter((v): v is number => v != null);
    const trimp = trimpValues.length > 0 ? trimpValues.reduce((s, v) => s + v, 0) : null;
    const endPoint = fitnessByDay.get(weekEnd <= to ? weekEnd : to);

    let zonePct: Record<string, number> | null = null;
    if (hrZones) {
      const totals = new Map<number, number>(hrZones.map((z) => [z.index, 0]));
      let total = 0;
      for (const a of inWeek) {
        const seconds = zonesByActivity.get(a.id);
        if (!seconds) continue;
        seconds.forEach((s, i) => {
          totals.set(i + 1, (totals.get(i + 1) ?? 0) + s);
          total += s;
        });
      }
      if (total > 0) {
        zonePct = {};
        for (const [zoneIndex, seconds] of totals) {
          zonePct[`Z${zoneIndex}`] = Math.round((seconds / total) * 1000) / 10;
        }
      }
    }

    return {
      weekStart,
      weekEnd,
      runKm,
      rideKm,
      sessions: inWeek.length,
      elevationM,
      durationS,
      trimp,
      ctlEnd: endPoint ? endPoint.ctl : null,
      atlEnd: endPoint ? endPoint.atl : null,
      tsbEnd: endPoint ? endPoint.tsb : null,
      zonePct,
    };
  });

  // -- Santé quotidienne : une ligne par jour, même sans mesure ----------------
  const healthByDay = new Map(healthRows.map((h) => [h.day, h]));
  const health: ExportData["health"] = eachDay(from, to).map((day) => {
    const row = healthByDay.get(day);
    return {
      day,
      hrv: row?.hrv ?? null,
      restingHr: row?.restingHr ?? null,
      sleepDurationMin: row?.sleepDurationMin ?? null,
      sleepDeepMin: row?.sleepDeepMin ?? null,
      sleepScore: row?.sleepScore ?? null,
      recoveryStatusPct: row?.recoveryStatusPct ?? null,
    };
  });

  // -- Records ------------------------------------------------------------------
  const [longestRunProgression, bestKm, recordWeek, twentyMinBest] = await Promise.all([
    loadLongestRunProgression(),
    loadBestKilometer(),
    loadRecordWeek(),
    loadBestEfforts("1970-01-01", to).then((efforts) => efforts.find((e) => e.durationS === 1200) ?? null),
  ]);
  const longestRun = longestRunProgression[longestRunProgression.length - 1] ?? null;
  const records: ExportData["records"] = [
    { label: "Plus longue sortie", value: longestRun ? longestRun.distanceM / 1000 : null, unit: "km", day: longestRun?.day ?? null, estimated: false },
    {
      label: "Meilleur km",
      value: bestKm ? bestKm.movingTimeS / (bestKm.distanceM / 1000) : null,
      unit: "s/km",
      day: bestKm?.day ?? null,
      estimated: false,
    },
    {
      label: "Allure sur 20 min",
      value: twentyMinBest ? twentyMinBest.durationS / (twentyMinBest.distanceM / 1000) : null,
      unit: "s/km",
      day: null,
      estimated: false,
    },
    { label: "Semaine record", value: recordWeek?.km ?? null, unit: "km", day: recordWeek?.weekStart ?? null, estimated: false },
  ];

  // -- Plan ------------------------------------------------------------------
  const plan: ExportData["plan"] = {
    goal: nextGoal
      ? {
          name: nextGoal.name,
          day: nextGoal.day,
          distanceM: nextGoal.distanceM,
          targetTimeMinS: nextGoal.targetTimeMinS,
          targetTimeMaxS: nextGoal.targetTimeMaxS,
        }
      : null,
    workouts: plannedWorkouts.map((w) => ({
      day: w.day,
      title: w.title,
      type: w.type,
      status: w.status,
      targetDistanceM: w.targetDistanceM,
      targetDurationS: w.targetDurationS,
      activityId: w.activity?.id ?? null,
    })),
  };

  // -- Qualité des données ------------------------------------------------------
  const daysWithoutHealthMetric = health.filter((h) => h.hrv == null && h.restingHr == null).length;
  const activitiesWithoutHr = activities.filter((a) => !a.hasHeartrate).length;
  // Approximation assumée : `hasStreams` ne garantit pas la présence du flux
  // latlng précisément (une séance en salle a des flux sans GPS), mais
  // vérifier latlng activité par activité exigerait de décompresser chaque
  // flux ici — coûteux sur "toute la période". `hasStreams=false` implique
  // sûrement l'absence de GPS ; l'inverse est une approximation, documentée
  // ici plutôt que présentée comme une mesure exacte.
  const activitiesWithoutGps = activities.filter((a) => !a.hasStreams).length;

  const suspectedDuplicates: Array<{ a: string; b: string }> = [];
  const sorted = [...activities].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]!;
    const b = sorted[i + 1]!;
    const minutesApart = Math.abs(b.startedAt.getTime() - a.startedAt.getTime()) / 60000;
    const distanceDeltaFraction = a.distanceM > 0 ? Math.abs(b.distanceM - a.distanceM) / a.distanceM : 1;
    if (minutesApart < 10 && distanceDeltaFraction < 0.05) {
      suspectedDuplicates.push({ a: a.id, b: b.id });
    }
  }

  const estimatedFields = [
    "trimp (Banister, formule appliquée aux flux ou à la FC moyenne)",
    "gapPaceSPerKm (modèle de Minetti)",
    "decouplingPct (Pa:Hr)",
    "records 5 km / 10 km (prédiction Riegel/VDOT/vitesse critique)",
    "ctlEnd / atlEnd / tsbEnd des semaines (moyennes mobiles exponentielles de Banister, pas une mesure)",
  ];

  // Le cycle de postes est toujours défini par construction (repli sur
  // DEFAULT_SHIFT_CYCLE, voir shifts/defaults.ts) : il n'y a pas de « trou »
  // possible dans sa résolution. Ce champ reste présent (toujours vide) pour
  // que la section Qualité documente explicitement ce qu'elle a vérifié, pas
  // seulement ce qu'elle a trouvé — une section qui omettrait ce point
  // laisserait croire qu'il n'a pas été envisagé.
  const periodsWithoutShift: string[] = [];

  const quality: ExportData["quality"] = {
    daysWithoutHealthMetric,
    activitiesWithoutHr,
    activitiesWithoutGps,
    suspectedDuplicates,
    estimatedFields,
    periodsWithoutShift,
  };

  const meta: ExportData["meta"] = {
    schemaVersion: EXPORT_SCHEMA_VERSION,
    exportedAt: today(),
    periodFrom: from,
    periodTo: to,
    scope: options.scope,
    timezone: "Europe/Paris",
    counts: { activities: activities.length, healthDays: health.length, weeks: weeks.length },
    notation: { estimated: "est.", unavailable: "non disponible" },
  };

  return {
    meta,
    profile,
    shifts,
    weeks,
    activities: exportActivities,
    activityDetails,
    health,
    records,
    plan,
    quality,
  };
}
