import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { prisma } from "@/lib/db.ts";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { loadReplacementStats, loadShiftRange } from "@/lib/shifts/repository.ts";
import { addDays, mondayOf, type Day } from "@/lib/shifts/day.ts";
import { formatMonth, today } from "@/lib/time.ts";
import { MonthGrid, type CalendarDay } from "@/components/calendar/month-grid.tsx";
import { Card, CardHeader, Stat } from "@/components/ui/card.tsx";

export const dynamic = "force-dynamic";

function monthBounds(year: number, month: number): { first: Day; last: Day } {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDate = new Date(Date.UTC(year, month, 0));
  return { first, last: lastDate.toISOString().slice(0, 10) };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const { m } = await searchParams;
  const now = today();
  const [defaultYear, defaultMonth] = [Number(now.slice(0, 4)), Number(now.slice(5, 7))];

  const match = /^(\d{4})-(\d{2})$/.exec(m ?? "");
  const year = match ? Number(match[1]) : defaultYear;
  const month = match ? Number(match[2]) : defaultMonth;

  const { first, last } = monthBounds(year, month);
  // La grille affiche des semaines complètes : on élargit au lundi précédent
  // et au dimanche suivant.
  const gridFrom = mondayOf(first);
  const gridTo = addDays(mondayOf(addDays(last, 7)), -1);

  const rules = await getAvailabilityRules();
  const [range, stats, activities, planned, raceGoals, activePlans] = await Promise.all([
    loadShiftRange(gridFrom, gridTo, rules),
    loadReplacementStats(addDays(now, -90), now),
    prisma.activity.findMany({
      where: { startDay: { gte: gridFrom, lte: gridTo } },
      select: { id: true, startDay: true, distanceM: true, movingTimeS: true, name: true },
      orderBy: { startedAt: "asc" },
    }),
    prisma.plannedWorkout.findMany({
      where: { day: { gte: gridFrom, lte: gridTo } },
      select: {
        id: true,
        day: true,
        type: true,
        title: true,
        status: true,
        isProvisional: true,
        isKeySession: true,
      },
      orderBy: { orderInDay: "asc" },
    }),
    prisma.goal.findMany({
      where: { isActive: true, day: { gte: gridFrom, lte: gridTo } },
      select: { day: true },
    }),
    prisma.trainingPlan.findMany({
      where: { status: "active", startDay: { lte: gridTo }, endDay: { gte: gridFrom } },
      select: { phasesJson: true },
    }),
  ]);

  const raceDays = new Set(raceGoals.map((g) => g.day));
  const phases = activePlans.flatMap(
    (p) =>
      JSON.parse(p.phasesJson) as Array<{ startDay: string; endDay: string; weeklyVolumeKm?: number }>,
  );
  function weeklyVolumeTargetFor(day: Day): number | null {
    const phase = phases.find((ph) => ph.startDay <= day && day <= ph.endDay);
    return phase?.weeklyVolumeKm ?? null;
  }

  const days: CalendarDay[] = range.days.map((resolved) => {
    const availability = range.byDay.get(resolved.day)!.availability;
    return {
      day: resolved.day,
      code: resolved.code,
      theoreticalCode: resolved.theoreticalCode,
      isException: resolved.isException,
      isReplacement: resolved.isReplacement,
      isFreed: resolved.isFreed,
      inMonth: resolved.day >= first && resolved.day <= last,
      isToday: resolved.day === now,
      maxSessionMin: availability.maxSessionMin,
      allowsQuality: availability.allowsQuality,
      allowsLongRun: availability.allowsLongRun,
      blockers: availability.blockers,
      isRaceDay: raceDays.has(resolved.day),
      weeklyVolumeTargetKm: weeklyVolumeTargetFor(resolved.day),
      activities: activities
        .filter((a) => a.startDay === resolved.day)
        .map((a) => ({
          id: a.id,
          name: a.name,
          distanceM: a.distanceM,
          movingTimeS: a.movingTimeS,
        })),
      planned: planned
        .filter((p) => p.day === resolved.day)
        .map((p) => ({
          id: p.id,
          type: p.type,
          title: p.title,
          status: p.status,
          isProvisional: p.isProvisional,
          isKeySession: p.isKeySession,
        })),
    };
  });

  const prev = month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
  const next = month === 12 ? `${year + 1}-01` : `${year}-${String(month + 1).padStart(2, "0")}`;

  return (
    <div className="p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold capitalize">{formatMonth(year, month)}</h1>
          <p className="text-xs text-[var(--color-muted)]">
            Postes, séances planifiées et séances réalisées.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Link
            href={{ pathname: "/calendrier", query: { m: prev } }}
            aria-label="Mois précédent"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-strong)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-2)]"
          >
            <ChevronLeft size={16} />
          </Link>
          <Link
            href="/calendrier"
            className="flex h-9 items-center rounded-lg border border-[var(--color-border-strong)] px-3 text-xs transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-2)]"
          >
            Aujourd&apos;hui
          </Link>
          <Link
            href={{ pathname: "/calendrier", query: { m: next } }}
            aria-label="Mois suivant"
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--color-border-strong)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-2)]"
          >
            <ChevronRight size={16} />
          </Link>
        </div>
      </header>

      <div className="mt-4">
        <MonthGrid days={days} timings={range.timings} />
      </div>

      <Card className="mt-6">
        <CardHeader
          title="Disponibilité réelle"
          hint="90 derniers jours. Mesure l'écart entre le cycle théorique et ce qui a réellement été travaillé."
        />
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:grid-cols-4 sm:divide-y-0">
          <Stat
            label="Jours travaillés"
            value={stats.actualWorkDays}
            hint={`${stats.theoreticalWorkDays} au cycle théorique`}
          />
          <Stat
            label="Remplacements acceptés"
            value={stats.replacementsAccepted}
            hint={`sur ${stats.theoreticalRestDays} jours de repos`}
            tone={stats.replacementsAccepted > 0 ? "warn" : "default"}
          />
          <Stat
            label="Taux de remplacement"
            value={`${Math.round(stats.replacementRate * 100)}`}
            unit="%"
            hint="repos entamés par un poste"
          />
          <Stat
            label="Charge de travail"
            value={`${Math.round(stats.workloadRatio * 100)}`}
            unit="%"
            hint="par rapport au cycle théorique"
            tone={stats.workloadRatio > 1.15 ? "warn" : "default"}
          />
        </div>
      </Card>
    </div>
  );
}
