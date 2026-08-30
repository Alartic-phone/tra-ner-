import { prisma } from "@/lib/db.ts";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { loadShiftRange } from "@/lib/shifts/repository.ts";
import { addDays, mondayOf, timeToMinutes, minutesToTime, diffDays, type Day } from "@/lib/shifts/day.ts";
import type { FreeWindow } from "@/lib/shifts/availability.ts";
import { today, toLocalTime } from "@/lib/time.ts";
import {
  getProfileStatus,
  loadReadiness,
  loadLastKnownHrv,
  loadTodaysWorkout,
  loadNextGoal,
  loadWeeklyVolumeTargetKm,
  loadPersonalRecords,
} from "@/lib/metrics/repository.ts";
import { computeHeartRateZones, zoneForHeartRate, type HeartRateZone } from "@/lib/metrics/zones.ts";
import { loadStreams } from "@/lib/streams.ts";
import { getEnv } from "@/lib/env.ts";
import { RUN_TYPES } from "@/lib/strava/mapping.ts";
import { WORKOUT_LABELS } from "@/components/plan/plan-view.tsx";
import { formatDistance, formatDuration, formatPace } from "@/lib/utils.ts";
import { DashboardHero, type FreshnessData, type FreshnessVerdict, type SessionData } from "@/components/dashboard/hero.tsx";
import { LastActivityCard } from "@/components/dashboard/last-activity-card.tsx";
import { WeekStrip, type WeekDayBar } from "@/components/dashboard/week-strip.tsx";
import { NextRaceStrip } from "@/components/dashboard/next-race-strip.tsx";

export const dynamic = "force-dynamic";

/** Libellé de période pour un créneau, en minutes depuis minuit. */
function periodLabel(startMin: number): string {
  if (startMin < 12 * 60) return "matinée";
  if (startMin < 18 * 60) return "après-midi";
  return "soirée";
}

/** Décrit le créneau en cours ou à venir, pour la salutation du héros. */
function describeWindows(windows: readonly FreeWindow[], nowMin: number): string | null {
  const active = windows.find((w) => nowMin >= w.startMin && nowMin < w.endMin);
  if (active) {
    const label = active.durationMin >= 600 ? "journée" : periodLabel(active.startMin);
    return `${label} libre jusqu'à ${minutesToTime(active.endMin)}`;
  }
  const upcoming = windows.find((w) => w.startMin > nowMin);
  if (upcoming) {
    return `${periodLabel(upcoming.startMin)} libre à partir de ${minutesToTime(upcoming.startMin)}`;
  }
  return null;
}

/** Zone FC dominante d'une journée, pondérée par le temps de chaque sortie. */
function dominantZoneForDay(
  activities: readonly { avgHr: number | null; movingTimeS: number }[],
  zones: readonly HeartRateZone[] | null,
): number | null {
  if (!zones || zones.length === 0) return null;
  const withHr = activities.filter((a): a is { avgHr: number; movingTimeS: number } => a.avgHr != null);
  const totalTime = withHr.reduce((sum, a) => sum + a.movingTimeS, 0);
  if (totalTime <= 0) return null;
  const weighted = withHr.reduce((sum, a) => {
    const zone = zoneForHeartRate(a.avgHr, zones);
    return sum + (zone ? zone.index * a.movingTimeS : 0);
  }, 0);
  return Math.max(1, Math.min(5, Math.round(weighted / totalTime)));
}

export default async function DashboardPage() {
  const now = today();
  const rules = await getAvailabilityRules();

  const weekStart = mondayOf(now);
  const weekEnd = addDays(weekStart, 6);
  const sparklineStart = addDays(weekStart, -7 * 7);

  const [
    range,
    profileStatus,
    readiness,
    lastKnownHrv,
    todaysWorkout,
    nextGoal,
    weeklyVolumeTargetKm,
    lastActivity,
    runActivities,
  ] = await Promise.all([
    loadShiftRange(weekStart, weekEnd, rules),
    getProfileStatus(),
    loadReadiness(now),
    loadLastKnownHrv(now),
    loadTodaysWorkout(now),
    loadNextGoal(),
    loadWeeklyVolumeTargetKm(now),
    prisma.activity.findFirst({ orderBy: { startedAt: "desc" } }),
    prisma.activity.findMany({
      where: { startDay: { gte: sparklineStart, lte: weekEnd }, type: { in: [...RUN_TYPES] } },
      select: { startDay: true, distanceM: true, avgHr: true, movingTimeS: true },
    }),
  ]);

  const [lastActivityStreams, lastActivityRecords] = await Promise.all([
    lastActivity ? loadStreams(lastActivity.id) : null,
    lastActivity ? loadPersonalRecords(lastActivity.id) : Promise.resolve([]),
  ]);

  const hrZones = profileStatus.profile
    ? computeHeartRateZones(profileStatus.profile.hrMax, profileStatus.profile.hrRest)
    : null;

  // --- Section 1 : héros -----------------------------------------------
  const todayEntry = range.byDay.get(now)!;
  const todayCode = todayEntry.resolved.code;
  const todayTiming = todayCode ? range.timings.find((t) => t.code === todayCode) : undefined;
  const shiftLabel = todayEntry.resolved.isWorking ? (todayTiming?.label ?? todayCode) : null;

  const nowMin = timeToMinutes(toLocalTime(new Date()));
  const windowDesc = describeWindows(todayEntry.availability.windows, nowMin);

  let greeting: string;
  if (shiftLabel) {
    const prefix = /^[aeiouyàâäéèêëîïôöùûü]/i.test(shiftLabel) ? "d'" : "de ";
    greeting = `Poste ${prefix}${shiftLabel.toLowerCase()}`;
  } else {
    greeting = "Jour de repos";
  }
  if (windowDesc) greeting += ` — ${windowDesc}`;

  const todaysWorkoutHrZoneRange =
    todaysWorkout?.targetHrZone != null && hrZones
      ? (hrZones.find((z) => z.index === todaysWorkout.targetHrZone) ?? null)
      : null;

  let session: SessionData;
  if (todaysWorkout) {
    const meta = WORKOUT_LABELS[todaysWorkout.type] ?? {
      label: todaysWorkout.type,
      tone: "neutral" as const,
    };
    const parts: string[] = [];
    if (todaysWorkout.targetDistanceM != null) parts.push(formatDistance(todaysWorkout.targetDistanceM));
    if (todaysWorkout.targetDurationS != null) parts.push(formatDuration(todaysWorkout.targetDurationS));
    if (todaysWorkout.targetPaceMinSPerKm != null && todaysWorkout.targetPaceMaxSPerKm != null) {
      parts.push(`${formatPace(todaysWorkout.targetPaceMaxSPerKm)} – ${formatPace(todaysWorkout.targetPaceMinSPerKm)}`);
    }
    if (todaysWorkout.targetHrZone != null) {
      parts.push(
        `Z${todaysWorkout.targetHrZone}${todaysWorkoutHrZoneRange ? ` (${todaysWorkoutHrZoneRange.fromBpm}–${todaysWorkoutHrZoneRange.toBpm} bpm)` : ""}`,
      );
    }
    session = {
      kind: "workout",
      title: todaysWorkout.title,
      summary: parts.length > 0 ? parts.join(" · ") : null,
      statusLabel: meta.label,
      statusTone: meta.tone,
    };
  } else {
    session = { kind: "none" };
  }

  let freshness: FreshnessData;
  if (readiness) {
    const stopRule = readiness.result.status === "prudence" || readiness.restingHr > 65;
    const verdict: FreshnessVerdict = stopRule
      ? "Repos"
      : readiness.result.status === "correct"
        ? "Prudence"
        : "Feu vert";
    freshness = {
      kind: "available",
      hrv: readiness.hrv,
      restingHr: readiness.restingHr,
      hrvRange: readiness.hrvRange,
      restingHrRange: readiness.restingHrRange,
      verdict,
    };
  } else if (lastKnownHrv) {
    freshness = { kind: "stale", lastDay: lastKnownHrv.day, lastHrv: lastKnownHrv.hrv, today: now };
  } else {
    freshness = { kind: "unavailable" };
  }

  // --- Section 3 : la semaine --------------------------------------------
  const byDay = new Map<Day, { avgHr: number | null; movingTimeS: number; distanceM: number }[]>();
  for (const a of runActivities) {
    const list = byDay.get(a.startDay as Day) ?? [];
    list.push({ avgHr: a.avgHr, movingTimeS: a.movingTimeS, distanceM: a.distanceM });
    byDay.set(a.startDay as Day, list);
  }

  const weekDays: WeekDayBar[] = [];
  for (let i = 0; i < 7; i++) {
    const day = addDays(weekStart, i);
    const acts = byDay.get(day) ?? [];
    const dayEntry = range.byDay.get(day);
    const code = dayEntry?.resolved.isWorking ? dayEntry.resolved.code : null;
    const timing = code ? range.timings.find((t) => t.code === code) : undefined;
    weekDays.push({
      day,
      code,
      shiftColor: timing?.color ?? null,
      distanceKm: acts.reduce((sum, a) => sum + a.distanceM, 0) / 1000,
      dominantZone: dominantZoneForDay(acts, hrZones),
    });
  }

  const weekTotalKm = weekDays.reduce((sum, d) => sum + d.distanceKm, 0);

  const weekMondays: Day[] = [];
  for (let i = 7; i >= 0; i--) weekMondays.push(addDays(weekStart, -7 * i));
  const weeklyTotals = new Map<Day, number>(weekMondays.map((m) => [m, 0]));
  for (const a of runActivities) {
    const week = mondayOf(a.startDay as Day);
    weeklyTotals.set(week, (weeklyTotals.get(week) ?? 0) + a.distanceM / 1000);
  }
  const weeklySparkline = weekMondays.map((m) => weeklyTotals.get(m) ?? 0);

  // --- Section 4 : prochaine course ---------------------------------------
  const daysLeft = nextGoal ? diffDays(now, nextGoal.day) : 0;

  return (
    <div className="p-3 md:p-6">
      <DashboardHero greeting={greeting} session={session} freshness={freshness} />

      <div className="mt-4">
        <LastActivityCard
          activity={lastActivity}
          latlng={lastActivityStreams?.latlng ?? null}
          personalRecords={lastActivityRecords}
          mapTilerKey={getEnv().MAPTILER_API_KEY}
          cascadeStart={0}
        />
      </div>

      <div className="mt-4">
        <WeekStrip
          days={weekDays}
          totalKm={weekTotalKm}
          targetKm={weeklyVolumeTargetKm}
          weeklySparkline={weeklySparkline}
          today={now}
          cascadeIndex={3}
        />
      </div>

      <NextRaceStrip goal={nextGoal} daysLeft={daysLeft} />
    </div>
  );
}
