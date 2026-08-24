import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card.tsx";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { loadReplacementStats, loadShiftRange } from "@/lib/shifts/repository.ts";
import { addDays, minutesToTime } from "@/lib/shifts/day.ts";
import { formatDayLong, formatDayShort, today } from "@/lib/time.ts";
import { formatClock, formatDistance } from "@/lib/utils.ts";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = today();
  const rules = await getAvailabilityRules();

  const [range, stats, recent, weekActivities] = await Promise.all([
    loadShiftRange(now, addDays(now, 6), rules),
    loadReplacementStats(addDays(now, -90), now),
    prisma.activity.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
    prisma.activity.findMany({
      where: { startDay: { gte: addDays(now, -6), lte: now } },
      select: { distanceM: true, movingTimeS: true },
    }),
  ]);

  const weekDistance = weekActivities.reduce((sum, a) => sum + a.distanceM, 0);
  const weekTime = weekActivities.reduce((sum, a) => sum + a.movingTimeS, 0);
  const todayEntry = range.byDay.get(now);
  const todayCode = todayEntry?.resolved.code;
  const todayLabel = todayCode
    ? (range.timings.find((t) => t.code === todayCode)?.label ?? todayCode)
    : "repos";

  return (
    <div className="p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold">Tableau de bord</h1>
        <p className="mt-0.5 text-xs capitalize text-[var(--color-muted)]">
          {formatDayLong(now)}
        </p>
      </header>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Aujourd'hui"
            action={
              todayEntry?.resolved.isException ? (
                <Badge tone="warn">
                  {todayEntry.resolved.isReplacement ? "remplacement" : "modifié"}
                </Badge>
              ) : null
            }
          />
          <CardBody>
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-semibold">{todayLabel}</span>
              {todayEntry?.resolved.isException ? (
                <span className="text-xs text-[var(--color-muted)]">
                  (cycle :{" "}
                  {todayEntry.resolved.theoreticalCode
                    ? (range.timings.find(
                        (t) => t.code === todayEntry.resolved.theoreticalCode,
                      )?.label ?? todayEntry.resolved.theoreticalCode)
                    : "repos"}
                  )
                </span>
              ) : null}
            </div>

            {todayEntry ? (
              <>
                <ul className="mt-3 space-y-1 text-xs">
                  {todayEntry.availability.windows.length > 0 ? (
                    todayEntry.availability.windows.map((w) => (
                      <li key={w.startMin} className="tabular text-[var(--color-text)]">
                        {minutesToTime(w.startMin)} – {minutesToTime(w.endMin)}
                        <span className="ml-2 text-[var(--color-muted)]">
                          {w.durationMin} min
                          {w.allowsQuality
                            ? w.qualityStartMin && w.qualityStartMin > w.startMin
                              ? ` · qualité possible à partir de ${minutesToTime(w.qualityStartMin)}`
                              : " · qualité possible"
                            : " · endurance uniquement"}
                        </span>
                      </li>
                    ))
                  ) : (
                    <li className="text-[var(--color-warn)]">
                      Aucun créneau exploitable aujourd&apos;hui.
                    </li>
                  )}
                </ul>

                {todayEntry.availability.blockers.length > 0 ? (
                  <ul className="mt-2 space-y-0.5">
                    {todayEntry.availability.blockers.map((b) => (
                      <li key={b} className="text-[11px] text-[var(--color-warn)]">
                        {b}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </>
            ) : null}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="État de forme"
            hint="CTL, ATL, TSB et ratio aigu/chronique : moteur de calcul prévu en phase 4."
          />
          <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:grid-cols-4 sm:divide-y-0">
            <Stat label="CTL (fitness)" value={<Unavailable />} />
            <Stat label="ATL (fatigue)" value={<Unavailable />} />
            <Stat label="TSB (forme)" value={<Unavailable />} />
            <Stat label="Ratio A/C" value={<Unavailable />} />
          </div>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="7 derniers jours" />
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:grid-cols-4 sm:divide-y-0">
          <Stat label="Distance" value={formatDistance(weekDistance)} />
          <Stat label="Temps" value={formatClock(weekTime)} />
          <Stat label="Séances" value={weekActivities.length} />
          <Stat
            label="Charge de travail"
            value={`${Math.round(stats.workloadRatio * 100)}`}
            unit="%"
            hint="90 j, par rapport au cycle théorique"
            tone={stats.workloadRatio > 1.15 ? "warn" : "default"}
          />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Prochains jours"
            hint="Postes et créneaux disponibles."
            action={
              <Link href="/calendrier" className="text-xs text-[var(--color-accent)] hover:underline">
                Calendrier →
              </Link>
            }
          />
          <div className="divide-y divide-[var(--color-border)]">
            {range.days.map((d) => {
              const availability = range.byDay.get(d.day)!.availability;
              const timing = d.code ? range.timings.find((t) => t.code === d.code) : undefined;
              return (
                <div key={d.day} className="flex items-center justify-between px-4 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="w-16 text-[var(--color-muted)]">
                      {formatDayShort(d.day)}
                    </span>
                    {d.code ? (
                      <span
                        className="rounded px-1 text-[10px] font-semibold text-white"
                        style={{ backgroundColor: timing?.color ?? "#64748b" }}
                      >
                        {d.code}
                      </span>
                    ) : (
                      <span className="text-[var(--color-faint)]">repos</span>
                    )}
                    {d.isReplacement ? <Badge tone="warn">remplacement</Badge> : null}
                  </div>
                  <div className="tabular text-[var(--color-muted)]">
                    {availability.maxSessionMin > 0 ? `${availability.maxSessionMin} min` : "—"}
                    {availability.allowsLongRun ? (
                      <span className="ml-2 text-[var(--color-ok)]">sortie longue</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Dernières activités"
            action={
              <Link href="/activites" className="text-xs text-[var(--color-accent)] hover:underline">
                Tout voir →
              </Link>
            }
          />
          {recent.length === 0 ? (
            <CardBody>
              <p className="text-xs text-[var(--color-muted)]">
                Aucune activité. Connecter Strava depuis les{" "}
                <Link href="/reglages" className="text-[var(--color-accent)] hover:underline">
                  réglages
                </Link>
                .
              </p>
            </CardBody>
          ) : (
            <div className="divide-y divide-[var(--color-border)]">
              {recent.map((a) => (
                <Link
                  key={a.id}
                  href={{ pathname: `/activites/${a.id}` }}
                  className="flex items-center justify-between px-4 py-2 text-xs hover:bg-[var(--color-surface-2)]"
                >
                  <span className="min-w-0 flex-1 truncate">{a.name}</span>
                  <span className="tabular ml-3 shrink-0 text-[var(--color-muted)]">
                    {formatDistance(a.distanceM)} · {formatClock(a.movingTimeS)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
