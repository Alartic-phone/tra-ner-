import { prisma } from "../db.ts";
import { addDays, diffDays, eachDay, mondayOf, type Day } from "../shifts/day.ts";
import { getAvailabilityRules } from "../settings.ts";
import { loadShiftRange } from "../shifts/repository.ts";
import { loadStreams } from "../streams.ts";
import { toLocalTime } from "../time.ts";
import { isRun } from "../strava/mapping.ts";
import {
  getProfileStatus,
  loadFitnessSnapshot,
  loadLongestRunProgression,
  loadPaceZones,
  loadZoneDistribution,
} from "../metrics/repository.ts";
import { computeHeartRateZones, timeInZones } from "../metrics/zones.ts";
import { computeKmSplits } from "../metrics/splits.ts";
import { TRIMP_METHOD_LABELS } from "../metrics/trimp.ts";
import type { ExportActivityDetail, ExportScope } from "./scope.ts";
import { resolvePeriod } from "./scope.ts";
import {
  EXPORT_SCHEMA_VERSION,
  type ExportActivityDetail as ExportActivityDetailData,
  type ExportActivityRow,
  type ExportData,
  type ExportHealthRow,
  type ExportPlan,
  type ExportProfile,
  type ExportQuality,
  type ExportRecords,
  type ExportShifts,
  type ExportWeekRow,
} from "./schema.ts";

/**
 * Passerelle unique entre l'export et la base : rassemble un `ExportData`
 * complet pour la portée demandée. Les renderers (markdown.ts, json.ts,
 * csv.ts) sont ensuite des fonctions PURES de cet objet — aucun ne retourne
 * en base, ce qui garantit qu'un même `ExportData` produit toujours le même
 * fichier, quel que soit le format.
 */

/**
 * Résout la période effective. `resolvePeriod` (pur, sans base) retombe sur
 * "2000-01-01" pour "tout" faute de mieux — ici, avec la base sous la main,
 * on part plutôt du premier jour où quelque chose existe réellement : sans
 * ça, un export "tout" sur une base neuve produirait des dizaines de milliers
 * de lignes de cycle théorique avant la moindre donnée.
 */
async function resolveActualPeriod(scope: ExportScope): Promise<{ from: Day; to: Day }> {
  const period = resolvePeriod(scope);
  if (scope.periodPreset !== "all") return period;

  const [firstActivity, firstHealth, firstPattern] = await Promise.all([
    prisma.activity.findFirst({ orderBy: { startDay: "asc" }, select: { startDay: true } }),
    prisma.healthMetric.findFirst({ orderBy: { day: "asc" }, select: { day: true } }),
    prisma.shiftPattern.findFirst({ where: { isActive: true }, select: { anchorDay: true } }),
  ]);

  const candidates = [firstActivity?.startDay, firstHealth?.day, firstPattern?.anchorDay].filter(
    (d): d is Day => d != null,
  );
  if (candidates.length === 0) return { from: addDays(period.to, -90), to: period.to };

  return { from: candidates.reduce((min, d) => (d < min ? d : min)), to: period.to };
}

export async function collectExportData(scope: ExportScope): Promise<ExportData> {
  const { from, to } = await resolveActualPeriod(scope);
  const s = scope.sections;

  const rules = await getAvailabilityRules();
  const [activities, shiftRange, profileStatus] = await Promise.all([
    prisma.activity.findMany({
      where: { startDay: { gte: from, lte: to } },
      orderBy: [{ startDay: "asc" }, { startedAt: "asc" }, { id: "asc" }],
      include: { laps: { orderBy: { lapIndex: "asc" } } },
    }),
    loadShiftRange(from, to, rules),
    getProfileStatus(),
  ]);

  const shiftCodeForDay = (day: Day): string | null => shiftRange.byDay.get(day)?.resolved.code ?? null;

  const [profile, shifts, weeks, health, records, plan, quality] = await Promise.all([
    s.profile ? collectProfile() : Promise.resolve(null),
    s.shifts ? collectShifts(from, to, shiftRange) : Promise.resolve(null),
    s.weeks ? collectWeeks(from, to) : Promise.resolve(null),
    s.health ? collectHealth(from, to, shiftRange) : Promise.resolve(null),
    s.records ? collectRecords() : Promise.resolve(null),
    s.plan ? collectPlan(from, to, profileStatus.profile) : Promise.resolve(null),
    s.quality ? collectQuality(from, to, activities) : Promise.resolve(null),
  ]);

  const activityRows: ExportActivityRow[] | null = s.activities
    ? activities.map((a) => ({
        id: a.id,
        day: a.startDay,
        time: toLocalTime(a.startedAt),
        sport: a.sportType ?? a.type,
        name: a.name,
        distanceM: a.distanceM,
        movingTimeS: a.movingTimeS,
        elapsedTimeS: a.elapsedTimeS,
        avgSpeedMps: a.avgSpeedMps,
        avgHr: a.avgHr,
        maxHr: a.maxHr,
        elevationGainM: a.elevationGainM,
        avgCadence: a.avgCadence,
        calories: a.calories,
        trimp: a.trimp,
        trimpEstimated: a.trimpMethod !== null && a.trimpMethod !== "coros_native",
        shiftCode: shiftCodeForDay(a.startDay),
        source: a.source,
      }))
    : null;

  const detailTargets = selectActivityDetailTargets(activities, scope.activityDetail);
  const activityDetails = await Promise.all(detailTargets.map((a) => collectActivityDetail(a)));

  const streams = scope.includeStreams
    ? await collectStreams(scope.streamActivityIds.filter((id) => activities.some((a) => a.id === id)))
    : null;

  const sources = [...new Set(activities.map((a) => a.source))].sort();
  const healthCount = await prisma.healthMetric.count({ where: { day: { gte: from, lte: to } } });
  const plannedCount = await prisma.plannedWorkout.count({ where: { day: { gte: from, lte: to } } });

  return {
    metadata: {
      schemaVersion: EXPORT_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      timezone: "Europe/Paris",
      period: { from, to },
      counts: { activities: activities.length, healthDays: healthCount, plannedWorkouts: plannedCount },
      sources,
      notation: { estimated: "[est]", unavailable: "non disponible" },
    },
    profile,
    shifts,
    weeks,
    activities: activityRows,
    activityDetails,
    health,
    records,
    plan,
    quality,
    streams,
  };
}

// ---------------------------------------------------------------------------
// 1. Profil et zones
// ---------------------------------------------------------------------------

async function collectProfile(): Promise<ExportProfile> {
  const [user, latestWeight, { profile, vmaKmh }, paceZones] = await Promise.all([
    prisma.user.findFirst(),
    prisma.healthMetric.findFirst({
      where: { weightKg: { not: null } },
      orderBy: { day: "desc" },
      select: { day: true, weightKg: true },
    }),
    getProfileStatus(),
    loadPaceZones(),
  ]);

  const ageYears =
    user?.birthDate != null
      ? Math.floor(diffDays(user.birthDate, new Date().toISOString().slice(0, 10)) / 365.25)
      : null;

  const weight =
    latestWeight?.weightKg != null
      ? { kg: latestWeight.weightKg, measuredOn: latestWeight.day }
      : user?.weightKg != null
        ? { kg: user.weightKg, measuredOn: null }
        : null;

  const hrZones = profile ? computeHeartRateZones(profile.hrMax, profile.hrRest) : [];

  return {
    ageYears,
    heightCm: null, // Aucun champ de taille dans le modèle : jamais inventé.
    weight,
    hrMax: user?.hrMax ?? null,
    hrRest: user?.hrRest ?? null,
    lactateThresholdHr: user?.lactateThresholdHr ?? null,
    zoneMethod: profile ? "Karvonen (réserve cardiaque)" : "non calculable",
    hrZones: hrZones.map((z) => ({ index: z.index, name: z.name, fromBpm: z.fromBpm, toBpm: z.toBpm })),
    vmaKmh,
    paceZones: paceZones ?? [],
  };
}

// ---------------------------------------------------------------------------
// 2. Postes
// ---------------------------------------------------------------------------

async function collectShifts(
  from: Day,
  to: Day,
  shiftRange: Awaited<ReturnType<typeof loadShiftRange>>,
): Promise<ExportShifts> {
  const exceptions = await prisma.shiftException.findMany({
    where: { day: { gte: from, lte: to } },
    orderBy: { day: "asc" },
  });

  const timingByCode = new Map(shiftRange.timings.map((t) => [t.code, t]));

  const days = shiftRange.days.map((d) => {
    const timing = d.code ? timingByCode.get(d.code) : undefined;
    const availability = shiftRange.byDay.get(d.day)?.availability;
    return {
      day: d.day,
      code: d.code,
      label: timing?.label ?? null,
      startTime: timing?.startTime ?? null,
      endTime: timing?.endTime ?? null,
      windows:
        availability?.windows.map((w) => ({
          start: minutesToTimeLocal(w.startMin),
          end: minutesToTimeLocal(w.endMin),
        })) ?? [],
      isException: d.isException,
      isReplacement: d.isReplacement,
    };
  });

  return {
    cycleAnchorDay: shiftRange.cycle.anchorDay,
    blocks: shiftRange.cycle.blocks,
    days,
    replacements: exceptions.map((e) => ({
      day: e.day,
      code: e.code,
      note: e.note,
      isReplacement: e.isReplacement,
    })),
  };
}

function minutesToTimeLocal(minutes: number): string {
  const norm = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// 3. Semaines
// ---------------------------------------------------------------------------

async function collectWeeks(from: Day, to: Day): Promise<ExportWeekRow[]> {
  const firstMonday = mondayOf(from);
  const weekStarts: Day[] = [];
  for (let d = firstMonday; d <= to; d = addDays(d, 7)) weekStarts.push(d);

  const [fitness, activities] = await Promise.all([
    loadFitnessSnapshot(from, to),
    prisma.activity.findMany({
      where: { startDay: { gte: firstMonday, lte: to } },
      select: {
        startDay: true,
        type: true,
        sportType: true,
        distanceM: true,
        elevationGainM: true,
        movingTimeS: true,
        trimp: true,
      },
    }),
  ]);

  const fitnessByDay = new Map(fitness.series.map((p) => [p.day, p]));

  return Promise.all(
    weekStarts.map(async (weekStart) => {
      const weekEnd = addDays(weekStart, 6);
      const inWeek = activities.filter((a) => a.startDay >= weekStart && a.startDay <= weekEnd);

      const runKm = inWeek.filter((a) => isRun(a.type)).reduce((s, a) => s + a.distanceM, 0) / 1000;
      const rideKm =
        inWeek.filter((a) => a.type.includes("Ride")).reduce((s, a) => s + a.distanceM, 0) / 1000;

      const otherBySport = new Map<string, number>();
      for (const a of inWeek) {
        if (isRun(a.type) || a.type.includes("Ride")) continue;
        const key = a.sportType ?? a.type;
        otherBySport.set(key, (otherBySport.get(key) ?? 0) + a.distanceM / 1000);
      }

      const trimps = inWeek.map((a) => a.trimp).filter((t): t is number => t != null);
      const endDayForFitness = weekEnd <= to ? weekEnd : to;
      const point = fitnessByDay.get(endDayForFitness);

      const zoneDistribution = await loadZoneDistribution(weekStart, weekEnd <= to ? weekEnd : to);
      const zoneTotal = zoneDistribution
        ? zoneDistribution.zones.reduce((s, z) => s + z.seconds, 0)
        : 0;

      return {
        weekStart,
        weekEnd,
        runKm,
        rideKm,
        otherSports: [...otherBySport.entries()].map(([sport, km]) => ({ sport, km })),
        sessions: inWeek.length,
        elevationGainM: inWeek.reduce((s, a) => s + (a.elevationGainM ?? 0), 0),
        totalTimeS: inWeek.reduce((s, a) => s + a.movingTimeS, 0),
        trimpTotal: trimps.length > 0 ? trimps.reduce((s, t) => s + t, 0) : null,
        ctl: point?.ctl ?? null,
        atl: point?.atl ?? null,
        tsb: point?.tsb ?? null,
        zoneDistributionPct:
          zoneDistribution && zoneTotal > 0
            ? zoneDistribution.zones.map((z) => ({ zone: z.index, pct: (z.seconds / zoneTotal) * 100 }))
            : null,
      };
    }),
  );
}

// ---------------------------------------------------------------------------
// 5. Détail des activités marquantes
// ---------------------------------------------------------------------------

function selectActivityDetailTargets(
  activities: Array<{ id: string; movingTimeS: number }>,
  detail: ExportActivityDetail,
): Array<{ id: string; movingTimeS: number }> {
  if (detail === "none") return [];
  if (detail === "all") return activities;
  return activities.filter((a) => a.movingTimeS > 45 * 60);
}

async function collectActivityDetail(activity: {
  id: string;
  movingTimeS: number;
}): Promise<ExportActivityDetailData> {
  const [streams, laps, bestEfforts, activityRow, profileStatus] = await Promise.all([
    loadStreams(activity.id),
    prisma.lap.findMany({ where: { activityId: activity.id }, orderBy: { lapIndex: "asc" } }),
    prisma.bestEffort.findMany({ where: { activityId: activity.id }, select: { durationS: true, distanceM: true } }),
    prisma.activity.findUnique({ where: { id: activity.id }, select: { decouplingPct: true } }),
    getProfileStatus(),
  ]);

  const splits =
    streams?.time && streams.distance
      ? computeKmSplits(streams.time, streams.distance, streams.heartrate, streams.altitude)
      : [];

  const zoneSeconds =
    profileStatus.profile && streams?.heartrate && streams.time
      ? (() => {
          const zones = computeHeartRateZones(profileStatus.profile!.hrMax, profileStatus.profile!.hrRest);
          const result = timeInZones(streams.heartrate!, streams.time!, zones);
          return zones.map((z) => ({ zone: z.index, seconds: result.byZone.get(z.index) ?? 0 }));
        })()
      : null;

  return {
    activityId: activity.id,
    splits,
    laps: laps.map((l) => ({
      lapIndex: l.lapIndex,
      name: l.name,
      distanceM: l.distanceM,
      movingTimeS: l.movingTimeS,
      avgSpeedMps: l.avgSpeedMps,
      avgHr: l.avgHr,
      maxHr: l.maxHr,
    })),
    zoneSeconds,
    decouplingPct: activityRow?.decouplingPct ?? null,
    bestEfforts,
  };
}

async function collectStreams(activityIds: string[]) {
  const streams = await Promise.all(
    activityIds.map(async (activityId) => {
      const data = await loadStreams(activityId);
      return { activityId, ...(data ?? {}) };
    }),
  );
  return streams;
}

// ---------------------------------------------------------------------------
// 6. Santé quotidienne
// ---------------------------------------------------------------------------

async function collectHealth(
  from: Day,
  to: Day,
  shiftRange: Awaited<ReturnType<typeof loadShiftRange>>,
): Promise<ExportHealthRow[]> {
  const rows = await prisma.healthMetric.findMany({
    where: { day: { gte: from, lte: to } },
    orderBy: { day: "asc" },
  });
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const timingByCode = new Map(shiftRange.timings.map((t) => [t.code, t]));

  return eachDay(from, to).map((day) => {
    const r = byDay.get(day);
    const resolved = shiftRange.byDay.get(day)?.resolved;
    const timing = resolved?.code ? timingByCode.get(resolved.code) : undefined;
    const sleepDeepPct =
      r?.sleepDeepMin != null && r.sleepDurationMin ? (r.sleepDeepMin / r.sleepDurationMin) * 100 : null;

    return {
      day,
      hrv: r?.hrv ?? null,
      shiftWindow: timing
        ? { code: resolved!.code, start: timing.startTime, end: timing.endTime }
        : resolved
          ? { code: null, start: "", end: "" }
          : null,
      restingHr: r?.restingHr ?? null,
      sleepDurationMin: r?.sleepDurationMin ?? null,
      sleepScore: r?.sleepScore ?? null,
      sleepDeepPct,
      naps: null, // Non collecté par l'application — toujours "non disponible".
    };
  });
}

// ---------------------------------------------------------------------------
// 7. Records
// ---------------------------------------------------------------------------

async function collectRecords(): Promise<ExportRecords> {
  const grouped = await prisma.bestEffort.groupBy({ by: ["durationS"], _max: { distanceM: true } });

  const byDuration = await Promise.all(
    grouped
      .filter((g) => g._max.distanceM != null)
      .sort((a, b) => a.durationS - b.durationS)
      .map(async (g) => {
        const row = await prisma.bestEffort.findFirst({
          where: { durationS: g.durationS, distanceM: g._max.distanceM! },
          orderBy: { day: "asc" },
          select: { day: true, activityId: true },
        });
        return {
          durationS: g.durationS,
          distanceM: g._max.distanceM!,
          day: row?.day ?? "",
          activityId: row?.activityId ?? "",
        };
      }),
  );

  const longestRunProgression = await loadLongestRunProgression();

  return { byDuration, longestRunProgression };
}

// ---------------------------------------------------------------------------
// 8. Plan
// ---------------------------------------------------------------------------

async function collectPlan(
  from: Day,
  to: Day,
  profile: { hrMax: number; hrRest: number } | null,
): Promise<ExportPlan> {
  const [activeGoal, workouts] = await Promise.all([
    prisma.goal.findFirst({
      where: { isActive: true, day: { gte: to } },
      orderBy: { day: "asc" },
    }),
    prisma.plannedWorkout.findMany({
      where: { day: { gte: from, lte: to } },
      orderBy: [{ day: "asc" }, { orderInDay: "asc" }],
      include: { activity: { select: { id: true, distanceM: true, avgHr: true } } },
    }),
  ]);

  const zones = profile ? computeHeartRateZones(profile.hrMax, profile.hrRest) : [];

  return {
    activeGoal: activeGoal
      ? {
          name: activeGoal.name,
          day: activeGoal.day,
          distanceM: activeGoal.distanceM,
          targetTimeS: activeGoal.targetTimeS,
        }
      : null,
    workouts: workouts.map((w) => {
      const realized = w.activity
        ? {
            activityId: w.activity.id,
            distanceM: w.activity.distanceM,
            distanceDeltaPct:
              w.targetDistanceM != null && w.targetDistanceM > 0
                ? ((w.activity.distanceM - w.targetDistanceM) / w.targetDistanceM) * 100
                : null,
            avgHr: w.activity.avgHr,
            inTargetZone:
              w.targetHrZone != null && w.activity.avgHr != null && zones.length > 0
                ? (() => {
                    const zone = zones.find((z) => z.index === w.targetHrZone);
                    return zone ? w.activity!.avgHr! >= zone.fromBpm && w.activity!.avgHr! < zone.toBpm : null;
                  })()
                : null,
          }
        : null;

      return {
        day: w.day,
        type: w.type,
        title: w.title,
        targetDistanceM: w.targetDistanceM,
        targetHrZone: w.targetHrZone,
        status: w.status,
        realized,
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// 9. Qualité des données
// ---------------------------------------------------------------------------

async function collectQuality(
  from: Day,
  to: Day,
  activities: Array<{ id: string; startDay: string; startedAt: Date; distanceM: number; hasHeartrate: boolean }>,
): Promise<ExportQuality> {
  const totalDays = diffDays(from, to) + 1;

  const [healthDaysPresent, streamRows, activePattern, estimatedTrimpCount] = await Promise.all([
    prisma.healthMetric.count({ where: { day: { gte: from, lte: to } } }),
    prisma.activityStream.findMany({
      where: { activityId: { in: activities.map((a) => a.id) } },
      select: { activityId: true, availableStreamsJson: true },
    }),
    prisma.shiftPattern.findFirst({ where: { isActive: true } }),
    prisma.activity.count({
      where: { startDay: { gte: from, lte: to }, trimpMethod: { not: null, notIn: ["banister_stream"] } },
    }),
  ]);

  const gpsByActivity = new Map(
    streamRows.map((r) => [r.activityId, (JSON.parse(r.availableStreamsJson) as string[]).includes("latlng")]),
  );
  const activitiesWithoutGps = activities.filter((a) => !gpsByActivity.get(a.id)).length;
  const activitiesWithoutHr = activities.filter((a) => !a.hasHeartrate).length;

  // Doublons suspects : activités triées par heure de départ, comparées à
  // leur seule voisine immédiate (deux doublons sont par nature proches dans
  // le temps, un balayage adjacent suffit et reste linéaire).
  const sorted = [...activities].sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
  const suspectedDuplicates: ExportQuality["suspectedDuplicates"] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const curr = sorted[i]!;
    const gapMinutes = (curr.startedAt.getTime() - prev.startedAt.getTime()) / 60000;
    if (gapMinutes >= 10) continue;
    const relDelta =
      prev.distanceM > 0 ? Math.abs(curr.distanceM - prev.distanceM) / prev.distanceM : Infinity;
    if (relDelta < 0.05) {
      suspectedDuplicates.push({ activityIds: [prev.id, curr.id], day: curr.startDay, gapMinutes });
    }
  }

  const estimatedFields: string[] = [
    "allure ajustée du dénivelé (GAP) — modèle de Minetti",
    "découplage cardiaque (Pa:Hr)",
  ];
  if (estimatedTrimpCount > 0) {
    estimatedFields.push(
      `charge (TRIMP) sur ${estimatedTrimpCount} activité(s) — méthode moyenne ou RPE, cf. ${TRIMP_METHOD_LABELS.banister_average as string}`,
    );
  }

  return {
    healthDaysMissing: totalDays - healthDaysPresent,
    healthDaysTotal: totalDays,
    activitiesWithoutHr,
    activitiesWithoutGps,
    suspectedDuplicates,
    estimatedFields,
    shiftsUnconfiguredDays: activePattern ? 0 : totalDays,
  };
}
