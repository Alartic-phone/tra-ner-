import { prisma } from "./db.ts";
import { addDays, diffDays, eachDay, mondayOf, type Day } from "./shifts/day.ts";
import { RUN_TYPES, isRun } from "./strava/mapping.ts";
import { computeHeartRateZones, timeInZones } from "./metrics/zones.ts";
import { getProfileStatus, loadZoneSecondsByActivity } from "./metrics/repository.ts";
import { loadStreams } from "./streams.ts";
import { MIN_PLAUSIBLE_PACE_S_PER_KM } from "./metrics/best-efforts.ts";
import type { WeekLoadInput } from "./home.ts";

/**
 * Repository dédié à l'accueil : chaque fonction lit la base une fois pour
 * une section précise (charge hebdomadaire, points de vigilance, agenda,
 * carnet de bord). La logique de décision reste dans lib/home.ts, pure et
 * testée — ce fichier ne fait que rassembler des faits.
 */

/** Jours depuis la dernière pesée connue, `null` si jamais mesurée. */
export async function loadDaysSinceLastWeighing(today: Day): Promise<number | null> {
  const last = await prisma.healthMetric.findFirst({
    where: { weightKg: { not: null } },
    orderBy: { day: "desc" },
    select: { day: true },
  });
  return last ? diffDays(last.day, today) : null;
}

/** Jours depuis la dernière séance de renforcement, `null` si aucune jamais. */
export async function loadDaysSinceLastStrength(today: Day): Promise<number | null> {
  const last = await prisma.activity.findFirst({
    where: { type: "WeightTraining" },
    orderBy: { startDay: "desc" },
    select: { startDay: true },
  });
  return last ? diffDays(last.startDay, today) : null;
}

/**
 * Fraction du temps mesuré passé HORS zones 1-2 sur la semaine — `null` sans
 * FC seuil renseignée ou sans aucune activité mesurée sur la période : une
 * fraction de zéro mesure inventerait une semaine parfaitement polarisée.
 */
export async function loadWeekOutOfZone12Fraction(weekStart: Day, weekEnd: Day): Promise<number | null> {
  const { thresholdHr, profile } = await getProfileStatus();
  if (thresholdHr == null) return null;

  const activities = await prisma.activity.findMany({
    where: { startDay: { gte: weekStart, lte: weekEnd }, hasStreams: true },
    select: { id: true },
  });
  if (activities.length === 0) return null;

  const zones = computeHeartRateZones(thresholdHr, profile?.hrMax ?? null);
  let inZone12 = 0;
  let total = 0;
  for (const { id } of activities) {
    const streams = await loadStreams(id);
    if (!streams?.heartrate || !streams.time) continue;
    const result = timeInZones(streams.heartrate, streams.time, zones);
    for (const [zoneIndex, seconds] of result.byZone) {
      total += seconds;
      if (zoneIndex <= 2) inZone12 += seconds;
    }
  }
  return total > 0 ? 1 - inZone12 / total : null;
}

const MAX_PLAUSIBLE_RUN_HR_MARGIN = 3; // bpm au-delà de la FC max mesurée — marge de mesure, pas une nouvelle FC max.

/**
 * Activités récentes portant une mesure hors bornes plausibles — le même
 * filet que best-efforts.ts, mais au niveau de l'activité entière plutôt que
 * d'une fenêtre : distance nulle avec durée non nulle, allure de course sous
 * le plancher physiologique, FC moyenne au-dessus de la FC max mesurée.
 */
export async function loadSuspiciousActivities(
  today: Day,
  lookbackDays = 14,
): Promise<Array<{ id: string; day: Day; reason: string }>> {
  const { profile } = await getProfileStatus();
  const from = addDays(today, -lookbackDays);
  const activities = await prisma.activity.findMany({
    where: { startDay: { gte: from, lte: today } },
    select: { id: true, startDay: true, type: true, distanceM: true, movingTimeS: true, avgSpeedMps: true, avgHr: true },
  });

  const out: Array<{ id: string; day: Day; reason: string }> = [];
  for (const a of activities) {
    if (a.distanceM === 0 && a.movingTimeS > 0 && (isRun(a.type) || a.type === "Ride")) {
      out.push({ id: a.id, day: a.startDay, reason: "distance nulle avec durée non nulle" });
      continue;
    }
    if (isRun(a.type) && a.avgSpeedMps != null && a.avgSpeedMps > 0) {
      const paceSPerKm = 1000 / a.avgSpeedMps;
      if (paceSPerKm < MIN_PLAUSIBLE_PACE_S_PER_KM) {
        out.push({ id: a.id, day: a.startDay, reason: `allure moyenne implausible pour une course (${Math.round(paceSPerKm)} s/km)` });
        continue;
      }
    }
    if (profile?.hrMax != null && a.avgHr != null && a.avgHr > profile.hrMax + MAX_PLAUSIBLE_RUN_HR_MARGIN) {
      out.push({ id: a.id, day: a.startDay, reason: `FC moyenne (${a.avgHr}) au-dessus de la FC max mesurée (${profile.hrMax})` });
    }
  }
  return out;
}

/**
 * Série de semaines pour la charge hebdomadaire (section 3.3). Avec un plan
 * actif : toutes les semaines du plan, réalisé + prévu (depuis les séances
 * individuelles, pas un chiffre de phase à plat — ça laisse apparaître les
 * vraies semaines allégées). Sans plan : les huit dernières semaines
 * RÉELLEMENT courues, sans aucune barre "prévu" — jamais une semaine future
 * inventée en l'absence de plan.
 */
export async function loadWeeklyLoadInputs(
  today: Day,
): Promise<{ weeks: WeekLoadInput[]; hasPlan: boolean }> {
  // Même règle que loadNextSession/loadAgendaDays : l'import CSV prime dès
  // qu'il existe, le plan Claude ne sert plus qu'en repli.
  const [plan, importedRange] = await Promise.all([
    prisma.trainingPlan.findFirst({
      where: { status: "active" },
      orderBy: { generatedAt: "desc" },
      select: { startDay: true, endDay: true },
    }),
    prisma.importedPlanSession.aggregate({ _min: { day: true }, _max: { day: true } }),
  ]);
  const hasImported = importedRange._min.day != null;

  // Toujours au moins huit semaines réelles jusqu'à la semaine en cours,
  // ÉTENDU par le plan (import ou Claude) s'il en sort (avant comme après) —
  // un plan qui ne couvre qu'une semaine ne doit jamais faire disparaître
  // l'historique récent, et un plan de plusieurs semaines à venir doit
  // rester visible en entier.
  const currentWeekStart = mondayOf(today);
  let rangeStart = addDays(currentWeekStart, -7 * 8);
  let rangeEnd = currentWeekStart;
  if (hasImported) {
    const importStart = mondayOf(importedRange._min.day!);
    const importEnd = mondayOf(importedRange._max.day!);
    if (importStart < rangeStart) rangeStart = importStart;
    if (importEnd > rangeEnd) rangeEnd = importEnd;
  } else if (plan) {
    const planStart = mondayOf(plan.startDay);
    const planEnd = mondayOf(plan.endDay);
    if (planStart < rangeStart) rangeStart = planStart;
    if (planEnd > rangeEnd) rangeEnd = planEnd;
  }
  const weekStarts: Day[] = [];
  for (let w = rangeStart; w <= rangeEnd; w = addDays(w, 7)) weekStarts.push(w);

  const from = weekStarts[0]!;
  const to = addDays(weekStarts[weekStarts.length - 1]!, 6);

  const [activities, plannedSource] = await Promise.all([
    prisma.activity.findMany({
      where: { startDay: { gte: from, lte: to }, type: { in: [...RUN_TYPES] } },
      select: { startDay: true, distanceM: true },
    }),
    hasImported
      ? prisma.importedPlanSession
          .findMany({ where: { day: { gte: from, lte: to } }, select: { day: true, distanceM: true } })
          .then((rows) => rows.map((r) => ({ day: r.day, targetDistanceM: r.distanceM })))
      : plan
        ? prisma.plannedWorkout.findMany({
            where: { day: { gte: from, lte: to }, plan: { status: "active" } },
            select: { day: true, targetDistanceM: true },
          })
        : Promise.resolve([]),
  ]);

  const realizedByWeek = new Map<Day, number>();
  for (const a of activities) {
    const week = mondayOf(a.startDay);
    realizedByWeek.set(week, (realizedByWeek.get(week) ?? 0) + a.distanceM / 1000);
  }

  const plannedByWeek = new Map<Day, { km: number; hasAny: boolean }>();
  for (const w of plannedSource) {
    const week = mondayOf(w.day);
    const entry = plannedByWeek.get(week) ?? { km: 0, hasAny: false };
    entry.hasAny = true;
    if (w.targetDistanceM != null) entry.km += w.targetDistanceM / 1000;
    plannedByWeek.set(week, entry);
  }

  const weeks: WeekLoadInput[] = weekStarts.map((weekStart) => ({
    weekStart,
    realizedKm: realizedByWeek.get(weekStart) ?? 0,
    plannedKm: plannedByWeek.get(weekStart)?.hasAny ? plannedByWeek.get(weekStart)!.km : null,
  }));

  return { weeks, hasPlan: hasImported || plan != null };
}

export type NextSession = {
  day: Day;
  type: string;
  title: string;
  description: string | null;
  targetDistanceM: number | null;
  targetPaceMinSPerKm: number | null;
  targetPaceMaxSPerKm: number | null;
  hrTargetMinBpm: number | null;
  hrTargetMaxBpm: number | null;
  isProvisional: boolean;
};

/**
 * Prochaine séance à venir (aujourd'hui ou après) — `null` sans plan actif.
 *
 * L'import CSV (lib/plan-import/) est le chemin principal désormais : une
 * séance importée pour la période est TOUJOURS préférée à un plan généré
 * par l'API Claude, sans les mélanger jour par jour — un plan Claude
 * n'existe plus en pratique, mais le lire encore en repli évite qu'un
 * ancien plan actif disparaisse silencieusement de l'accueil.
 */
export async function loadNextSession(today: Day): Promise<NextSession | null> {
  const imported = await prisma.importedPlanSession.findFirst({
    where: { day: { gte: today }, status: "A_FAIRE" },
    orderBy: { day: "asc" },
  });
  if (imported) {
    return {
      day: imported.day,
      type: imported.type,
      title: imported.type,
      description: imported.objective || null,
      targetDistanceM: imported.distanceM,
      targetPaceMinSPerKm: null,
      targetPaceMaxSPerKm: null,
      hrTargetMinBpm: imported.hrTargetMinBpm,
      hrTargetMaxBpm: imported.hrTargetMaxBpm,
      isProvisional: false,
    };
  }

  const legacy = await prisma.plannedWorkout.findFirst({
    where: { day: { gte: today }, status: "upcoming", plan: { status: "active" } },
    orderBy: [{ day: "asc" }, { orderInDay: "asc" }],
    select: {
      day: true,
      type: true,
      title: true,
      description: true,
      targetDistanceM: true,
      targetPaceMinSPerKm: true,
      targetPaceMaxSPerKm: true,
      isProvisional: true,
    },
  });
  return legacy ? { ...legacy, hrTargetMinBpm: null, hrTargetMaxBpm: null } : null;
}

export type RecentActivity = {
  id: string;
  name: string;
  type: string;
  startedAt: Date;
  startDay: Day;
  distanceM: number;
  movingTimeS: number;
  avgHr: number | null;
  notes: string | null;
  tracePath: string | null;
  secondsByZone: number[] | null;
};

/** Cinq dernières activités pour le carnet de bord (section 3.6). */
export async function loadRecentActivities(limit = 5): Promise<RecentActivity[]> {
  const activities = await prisma.activity.findMany({
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      type: true,
      startedAt: true,
      startDay: true,
      distanceM: true,
      movingTimeS: true,
      avgHr: true,
      notes: true,
      tracePath: true,
    },
  });
  const zonesByActivity = await loadZoneSecondsByActivity(activities.map((a) => a.id));
  return activities.map((a) => ({ ...a, secondsByZone: zonesByActivity.get(a.id) ?? null }));
}

export type AgendaDay = {
  day: Day;
  isToday: boolean;
  shiftLabel: string;
  shiftCode: string | null;
  startTime: string | null;
  endTime: string | null;
  workout: { title: string; type: string } | null;
};

/** Sept prochains jours (section 3.5) : poste réel + séance prévue si un plan existe. */
export async function loadAgendaDays(
  today: Day,
  ribbonDays: ReadonlyArray<{
    day: Day;
    label: string;
    code: string | null;
    startTime: string | null;
    endTime: string | null;
  }>,
): Promise<AgendaDay[]> {
  const to = addDays(today, 6);

  // Même règle que loadNextSession : l'import CSV est préféré dès qu'il
  // couvre la période, le plan Claude ne sert plus qu'en repli.
  const imported = await prisma.importedPlanSession.findMany({
    where: { day: { gte: today, lte: to } },
    orderBy: { day: "asc" },
  });

  const workoutByDay = new Map<Day, { title: string; type: string }>();
  if (imported.length > 0) {
    for (const s of imported) {
      if (!workoutByDay.has(s.day)) workoutByDay.set(s.day, { title: s.type, type: s.type });
    }
  } else {
    const workouts = await prisma.plannedWorkout.findMany({
      where: { day: { gte: today, lte: to }, plan: { status: "active" } },
      orderBy: { orderInDay: "asc" },
      select: { day: true, title: true, type: true },
    });
    for (const w of workouts) if (!workoutByDay.has(w.day)) workoutByDay.set(w.day, w);
  }

  return eachDay(today, to).map((day) => {
    const ribbon = ribbonDays.find((r) => r.day === day);
    return {
      day,
      isToday: day === today,
      shiftLabel: ribbon?.label ?? "Repos",
      shiftCode: ribbon?.code ?? null,
      startTime: ribbon?.startTime ?? null,
      endTime: ribbon?.endTime ?? null,
      workout: workoutByDay.get(day) ?? null,
    };
  });
}
