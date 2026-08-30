import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { ActivityTypeIcon } from "@/components/activities/activity-icon.tsx";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card.tsx";
import { CountUp } from "@/components/ui/count-up.tsx";
import { ProgressRing } from "@/components/ui/progress-ring.tsx";
import { RouteMap } from "@/components/activities/route-map.tsx";
import { ReadinessBanner } from "@/components/dashboard/readiness-banner.tsx";
import { TodaySessionCard } from "@/components/dashboard/today-session-card.tsx";
import { RecordProgressBar } from "@/components/dashboard/record-progress-bar.tsx";
import { loadStreams, toGeoSeries } from "@/lib/streams.ts";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { loadReplacementStats, loadShiftRange } from "@/lib/shifts/repository.ts";
import { addDays, diffDays, minutesToTime } from "@/lib/shifts/day.ts";
import { formatDayLong, formatDayShort, today } from "@/lib/time.ts";
import {
  getProfileStatus,
  loadFitnessSnapshot,
  loadLongestRunProgression,
  loadNextGoal,
  loadReadiness,
  loadTodaysWorkout,
  loadWeeklyVolumeTargetKm,
} from "@/lib/metrics/repository.ts";
import { computeHeartRateZones } from "@/lib/metrics/zones.ts";
import { computeWeekStreak } from "@/lib/metrics/streak.ts";
import { formatClock, formatDistance } from "@/lib/utils.ts";
import { Flame } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = today();
  const rules = await getAvailabilityRules();

  const [
    range,
    stats,
    recent,
    weekActivities,
    fitness,
    streakDays,
    readiness,
    todaysWorkout,
    nextGoal,
    weeklyVolumeTargetKm,
    longestRunProgression,
    profileStatus,
  ] = await Promise.all([
    loadShiftRange(now, addDays(now, 6), rules),
    loadReplacementStats(addDays(now, -90), now),
    prisma.activity.findMany({ orderBy: { startedAt: "desc" }, take: 5 }),
    prisma.activity.findMany({
      where: { startDay: { gte: addDays(now, -6), lte: now } },
      select: { distanceM: true, movingTimeS: true },
    }),
    loadFitnessSnapshot(addDays(now, -30), now),
    prisma.activity.findMany({
      where: { startDay: { gte: addDays(now, -365), lte: now } },
      select: { startDay: true },
      distinct: ["startDay"],
    }),
    loadReadiness(now),
    loadTodaysWorkout(now),
    loadNextGoal(),
    loadWeeklyVolumeTargetKm(now),
    loadLongestRunProgression(),
    getProfileStatus(),
  ]);

  const weekStreak = computeWeekStreak(
    streakDays.map((a) => a.startDay),
    now,
  );

  const todaysWorkoutHrZoneRange =
    todaysWorkout?.targetHrZone != null && profileStatus.profile
      ? (computeHeartRateZones(profileStatus.profile.hrMax, profileStatus.profile.hrRest).find(
          (z) => z.index === todaysWorkout.targetHrZone,
        ) ?? null)
      : null;

  // Petites vignettes de tracé : un aperçu par activité récente, sans
  // remplacer la carte détaillée de la page activité.
  const recentRoutes = new Map(
    await Promise.all(
      recent.map(async (a) => {
        const streams = await loadStreams(a.id);
        return [a.id, streams ? toGeoSeries(streams) : []] as const;
      }),
    ),
  );

  const current = fitness.current;

  // Fourchettes fixes pour l'anneau — usage « coup d'œil » uniquement : la
  // courbe complète et non tronquée de la forme reste sur Analyses.
  const tsbTone = current == null ? "default" : current.tsb > 5 ? "ok" : current.tsb < -25 ? "danger" : "default";
  const tsbRingValue = current ? (current.tsb + 30) / 60 : 0;
  const acwrTone =
    fitness.acwr.zone === "alerte"
      ? "danger"
      : fitness.acwr.zone === "prudence"
        ? "warn"
        : fitness.acwr.zone === "optimale"
          ? "ok"
          : "default";
  const acwrRingValue = fitness.acwr.ratio != null ? fitness.acwr.ratio / 1.5 : 0;

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

      <div className="mt-4">
        <ReadinessBanner data={readiness} />
      </div>

      <div className="mt-4">
        <TodaySessionCard workout={todaysWorkout} hrZoneRange={todaysWorkoutHrZoneRange} />
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader title="Volume — semaine" />
          <CardBody className="flex items-center gap-4">
            {weeklyVolumeTargetKm != null ? (
              <ProgressRing
                value={weekActivities.reduce((sum, a) => sum + a.distanceM, 0) / 1000 / weeklyVolumeTargetKm}
                tone="info"
              >
                <span className="tabular text-lg font-semibold">
                  <CountUp value={weekActivities.reduce((sum, a) => sum + a.distanceM, 0) / 1000} decimals={0} />
                </span>
              </ProgressRing>
            ) : (
              <div className="flex h-24 w-24 flex-col items-center justify-center">
                <span className="tabular text-2xl font-bold">
                  <CountUp value={weekActivities.reduce((sum, a) => sum + a.distanceM, 0) / 1000} decimals={1} />
                </span>
                <span className="text-[11px] text-[var(--color-faint)]">km</span>
              </div>
            )}
            <p className="text-xs text-[var(--color-muted)]">
              {weeklyVolumeTargetKm != null ? (
                <>
                  Cible de la semaine :{" "}
                  <span className="tabular font-medium text-[var(--color-text)]">
                    {weeklyVolumeTargetKm.toFixed(0)} km
                  </span>{" "}
                  (phase du plan actif).
                </>
              ) : (
                <Unavailable reason="Aucun plan actif avec volume chiffré cette semaine" />
              )}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Forme (TSB)" />
          <CardBody className="flex items-center gap-4">
            {current ? (
              <ProgressRing value={tsbRingValue} tone={tsbTone}>
                <span className="tabular text-lg font-semibold">
                  <CountUp value={Math.round(current.tsb)} />
                </span>
              </ProgressRing>
            ) : (
              <div className="flex h-24 w-24 items-center justify-center">
                <Unavailable />
              </div>
            )}
            <p className="text-xs text-[var(--color-muted)]">
              Condition moins fatigue accumulée. Positif = forme, très négatif = fatigue.
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Prochaine course" />
          <CardBody>
            {nextGoal ? (
              <>
                <p className="text-sm font-medium">{nextGoal.name}</p>
                <div className="tabular mt-1 flex items-baseline gap-1">
                  <span className="text-3xl font-bold">
                    <CountUp value={diffDays(now, nextGoal.day)} />
                  </span>
                  <span className="text-xs text-[var(--color-muted)]">jours</span>
                </div>
                <p className="mt-1 text-[11px] text-[var(--color-faint)]">
                  {formatDistance(nextGoal.distanceM)}
                  {nextGoal.targetTimeS ? ` · objectif ${formatClock(nextGoal.targetTimeS)}` : ""}
                </p>
              </>
            ) : (
              <p className="text-xs">
                <Unavailable reason="Aucun objectif actif configuré" />
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card elevated>
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
              <span className="text-3xl font-semibold capitalize">{todayLabel}</span>
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

        <Card elevated>
          <CardHeader
            title="État de forme"
            hint={
              fitness.profileMissing.length > 0
                ? `Non calculable : il manque ${fitness.profileMissing.join(", ")} au profil.`
                : "Toutes ces valeurs sont des modèles, pas des mesures."
            }
            action={
              <Link href="/analyses" className="text-xs text-[var(--color-accent)] hover:underline">
                Analyses →
              </Link>
            }
          />
          <CardBody className="flex flex-wrap items-center gap-6">
            {fitness.acwr.ratio != null ? (
              <ProgressRing value={acwrRingValue} tone={acwrTone} label="Ratio aigu/chronique">
                <span className="tabular text-xl font-semibold" style={{ color: `var(--color-${acwrTone === "default" ? "text" : acwrTone})` }}>
                  <CountUp value={fitness.acwr.ratio} decimals={2} />
                </span>
              </ProgressRing>
            ) : (
              <div className="flex h-24 w-24 items-center justify-center">
                <Unavailable />
              </div>
            )}
            <div className="flex flex-1 flex-wrap gap-4">
              <Stat
                label="Série"
                value={
                  <span className="inline-flex items-center gap-1.5">
                    {weekStreak > 0 ? (
                      <Flame size={20} className="text-[var(--color-warn)]" aria-hidden />
                    ) : null}
                    <CountUp value={weekStreak} />
                  </span>
                }
                unit={weekStreak > 1 ? "semaines" : "semaine"}
                hint="d'affilée avec au moins une sortie"
              />
              <Stat
                label="Condition physique"
                value={current ? Math.round(current.ctl) : <Unavailable />}
                hint="42 jours"
                estimated
              />
              <Stat
                label="Fatigue"
                value={current ? Math.round(current.atl) : <Unavailable />}
                hint="7 jours"
                estimated
              />
            </div>
          </CardBody>
        </Card>

        <RecordProgressBar progression={longestRunProgression} />
      </div>

      {fitness.acwr.zone === "alerte" ? (
        <p className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-danger)]/40 px-3 py-2 text-xs text-[var(--color-danger)]">
          Ratio aigu/chronique à {fitness.acwr.ratio?.toFixed(2)} : progression de
          charge trop brutale. La semaine à venir doit être allégée.
        </p>
      ) : null}
      {fitness.foster.monotonyWarning ? (
        <p className="mt-3 rounded-[var(--radius-card)] border border-[var(--color-warn)]/40 px-3 py-2 text-xs text-[var(--color-warn)]">
          Monotonie de {fitness.foster.monotony?.toFixed(2)} sur sept jours :
          l&apos;entraînement manque de contraste. Une vraie journée de repos vaut
          mieux qu&apos;une séance de plus.
        </p>
      ) : null}

      <Card elevated className="mt-4">
        <CardHeader title="7 derniers jours" />
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:grid-cols-4 sm:divide-y-0">
          <Stat
            size="xl"
            label="Distance"
            value={<CountUp value={weekDistance / 1000} decimals={1} />}
            unit="km"
          />
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
              {recent.map((a, i) => (
                <Link
                  key={a.id}
                  href={{ pathname: `/activites/${a.id}` }}
                  className="stagger-item flex items-center justify-between px-4 py-2 text-xs transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-2)]"
                  style={{ "--stagger-index": i } as React.CSSProperties}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    {(recentRoutes.get(a.id)?.length ?? 0) >= 2 ? (
                      <span className="h-6 w-9 shrink-0 overflow-hidden">
                        <RouteMap
                          points={recentRoutes.get(a.id)!}
                          width={72}
                          height={48}
                          strokeWidth={4}
                          showMarkers={false}
                        />
                      </span>
                    ) : (
                      <ActivityTypeIcon type={a.type} className="shrink-0 text-[var(--color-muted)]" />
                    )}
                    <span className="truncate">{a.name}</span>
                  </span>
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
