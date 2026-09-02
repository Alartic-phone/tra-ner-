import { prisma } from "@/lib/db.ts";
import { Unavailable } from "@/components/ui/badge.tsx";
import { TraceOverlayMap } from "@/components/progression/trace-overlay-map.tsx";
import { RecordsWall } from "@/components/progression/records-wall.tsx";
import { LongestRunStaircase, PaceHrCloud } from "@/components/progression/progression-charts-lazy.tsx";
import { WeeklyVolumeBars, type WeekVolume } from "@/components/progression/weekly-volume-bars.tsx";
import { loadYearlyTraceOverlay } from "@/lib/progression.ts";
import { loadLongestRunProgression, loadRecordsWall } from "@/lib/metrics/repository.ts";
import { addDays, mondayOf } from "@/lib/shifts/day.ts";
import { today } from "@/lib/time.ts";
import { isRun } from "@/lib/strava/mapping.ts";

export const dynamic = "force-dynamic";

const WEEKS = 12;

export default async function ProgressionPage() {
  const now = today();
  const yearFrom = addDays(now, -365);
  const weeksFrom = mondayOf(addDays(now, -7 * (WEEKS - 1)));

  const [overlay, records, longestRun, paceHrActivities, weekActivities] = await Promise.all([
    loadYearlyTraceOverlay(),
    loadRecordsWall(),
    loadLongestRunProgression(),
    prisma.activity.findMany({
      where: { startDay: { gte: yearFrom }, avgHr: { not: null }, avgSpeedMps: { not: null } },
      select: { startDay: true, type: true, avgSpeedMps: true, avgHr: true, distanceM: true },
    }),
    prisma.activity.findMany({
      where: { startDay: { gte: weeksFrom } },
      select: { startDay: true, distanceM: true },
    }),
  ]);

  const staircasePoints = longestRun.map((p) => ({ day: p.day, distanceKm: p.distanceM / 1000 }));

  const paceHrPoints = paceHrActivities
    .filter((a) => isRun(a.type) && a.avgSpeedMps! > 0.5)
    .map((a) => ({
      day: a.startDay,
      paceSPerKm: 1000 / a.avgSpeedMps!,
      avgHr: a.avgHr!,
      distanceM: a.distanceM,
    }));

  const kmByWeek = new Map<string, number>();
  for (const a of weekActivities) {
    const weekStart = mondayOf(a.startDay);
    kmByWeek.set(weekStart, (kmByWeek.get(weekStart) ?? 0) + a.distanceM / 1000);
  }
  const weeks: WeekVolume[] = [];
  for (let w = weeksFrom; w <= mondayOf(now); w = addDays(w, 7)) {
    weeks.push({ weekStart: w, km: kmByWeek.get(w) ?? 0 });
  }

  return (
    <div className="mx-auto max-w-[1100px] p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold">Progression</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Une année d&apos;entraînement, faite de ce que vous avez réellement couru.
        </p>
      </header>

      <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-2 md:p-3">
        {overlay ? (
          <TraceOverlayMap overlay={overlay} />
        ) : (
          <div className="flex h-64 items-center justify-center">
            <p className="text-xs text-[var(--color-muted)]">
              <Unavailable reason="Aucun tracé GPS sur les 12 derniers mois" />
            </p>
          </div>
        )}
      </section>

      <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-medium">Mur des records</h2>
        <RecordsWall records={records} />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-2 text-sm font-medium">Plus longue sortie</h2>
          <LongestRunStaircase points={staircasePoints} />
        </section>

        <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-2 text-sm font-medium">Allure × fréquence cardiaque</h2>
          <PaceHrCloud points={paceHrPoints} now={now} />
        </section>
      </div>

      <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-3 text-sm font-medium">Volume hebdomadaire — 12 semaines</h2>
        <WeeklyVolumeBars weeks={weeks} />
      </section>
    </div>
  );
}
