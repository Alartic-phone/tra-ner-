import { prisma } from "@/lib/db.ts";
import { TodayBlock } from "@/components/dashboard/today-block.tsx";
import { LastActivityCard } from "@/components/dashboard/last-activity-card.tsx";
import { WeekBars, type WeekBarDay } from "@/components/dashboard/week-bars.tsx";
import { GoalCountdown } from "@/components/dashboard/goal-countdown.tsx";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { loadShiftRange } from "@/lib/shifts/repository.ts";
import { addDays, diffDays } from "@/lib/shifts/day.ts";
import { formatDayLong, today } from "@/lib/time.ts";
import {
  getProfileStatus,
  loadNextGoal,
  loadReadiness,
  loadTodaysWorkout,
} from "@/lib/metrics/repository.ts";
import { computeHeartRateZones } from "@/lib/metrics/zones.ts";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = today();
  const rules = await getAvailabilityRules();
  const weekFrom = addDays(now, -6);

  const [shiftRange, todaysWorkout, readiness, nextGoal, profileStatus, lastActivity, weekActivities] =
    await Promise.all([
      loadShiftRange(now, now, rules),
      loadTodaysWorkout(now),
      loadReadiness(now),
      loadNextGoal(),
      getProfileStatus(),
      prisma.activity.findFirst({
        orderBy: { startedAt: "desc" },
        include: { stream: { select: { tracePath: true, traceViewBox: true } } },
      }),
      prisma.activity.findMany({
        where: { startDay: { gte: weekFrom, lte: now } },
        select: { startDay: true, distanceM: true },
      }),
    ]);

  const todayEntry = shiftRange.byDay.get(now);
  const timing = todayEntry?.resolved.code
    ? shiftRange.timings.find((t) => t.code === todayEntry.resolved.code)
    : undefined;

  const hrZoneRange =
    todaysWorkout?.targetHrZone != null && profileStatus.profile
      ? (computeHeartRateZones(profileStatus.profile.hrMax, profileStatus.profile.hrRest).find(
          (z) => z.index === todaysWorkout.targetHrZone,
        ) ?? null)
      : null;

  const kmByDay = new Map<string, number>();
  for (const a of weekActivities) {
    kmByDay.set(a.startDay, (kmByDay.get(a.startDay) ?? 0) + a.distanceM / 1000);
  }
  const weekBars: WeekBarDay[] = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(weekFrom, i);
    return { day, km: kmByDay.get(day) ?? 0, isToday: day === now };
  });

  return (
    <div className="mx-auto max-w-[1100px] space-y-6 p-4 md:p-6">
      <header>
        <p className="text-xs capitalize text-[var(--color-muted)]">{formatDayLong(now)}</p>
      </header>

      <TodayBlock
        shift={{
          code: todayEntry?.resolved.code ?? null,
          label: timing?.label ?? "Repos",
          isException: todayEntry?.resolved.isException ?? false,
          isReplacement: todayEntry?.resolved.isReplacement ?? false,
          windows: todayEntry?.availability.windows ?? [],
        }}
        workout={todaysWorkout ? { ...todaysWorkout, hrZoneRange } : null}
        readiness={readiness}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <LastActivityCard
          activity={
            lastActivity
              ? {
                  id: lastActivity.id,
                  name: lastActivity.name,
                  type: lastActivity.type,
                  distanceM: lastActivity.distanceM,
                  avgSpeedMps: lastActivity.avgSpeedMps,
                  avgHr: lastActivity.avgHr,
                  tracePath: lastActivity.stream?.tracePath ?? null,
                  traceViewBox: lastActivity.stream?.traceViewBox ?? null,
                }
              : null
          }
        />

        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="text-sm font-medium">Semaine</h2>
          <div className="mt-2">
            <WeekBars days={weekBars} />
          </div>
        </div>

        <GoalCountdown
          goal={nextGoal}
          daysUntil={nextGoal ? diffDays(now, nextGoal.day) : 0}
        />
      </div>
    </div>
  );
}
