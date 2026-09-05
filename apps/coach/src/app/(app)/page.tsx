import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { PhotoHero } from "@/components/ui/photo-hero.tsx";
import { CycleRibbon } from "@/components/ui/cycle-ribbon.tsx";
import { HeroStat } from "@/components/ui/hero-stat.tsx";
import { TraceThumb } from "@/components/ui/trace-thumb.tsx";
import { ZoneBar } from "@/components/activities/zone-bar.tsx";
import { Card } from "@/components/ui/card.tsx";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { loadCycleRibbonDays, loadShiftRange } from "@/lib/shifts/repository.ts";
import { mondayOf, addDays, eachDay, diffDays } from "@/lib/shifts/day.ts";
import { today, currentHour, toLocalHour } from "@/lib/time.ts";
import { readPhotoManifest } from "@/lib/photo-manifest.ts";
import { pickPhoto, momentForContext } from "@/lib/photos.ts";
import { buildTodayPhrase } from "@/lib/home.ts";
import { isRun } from "@/lib/strava/mapping.ts";
import { normalizeActivityName } from "@/lib/activity-names.ts";
import {
  getProfileStatus,
  getTracePath,
  loadNextGoal,
  loadTodaysWorkout,
  loadWeeklyVolumeTargetKm,
  loadZoneSecondsByActivity,
} from "@/lib/metrics/repository.ts";
import { computeHeartRateZones } from "@/lib/metrics/zones.ts";
import { computeSportVolume } from "@/lib/metrics/volume.ts";
import {
  fixed,
  formatClock,
  formatDistance,
  formatPace,
  formatTimeRange,
  paceFromSpeed,
} from "@/lib/utils.ts";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const day = today();
  const rules = await getAvailabilityRules();

  const weekStart = mondayOf(day);
  const weekEnd = addDays(weekStart, 6);
  const weekDays = eachDay(weekStart, weekEnd);

  const [
    ribbonDays,
    weekRange,
    weekActivities,
    lastActivity,
    todaysWorkout,
    weeklyTargetKm,
    user,
    nextGoal,
    manifest,
    profileStatus,
  ] = await Promise.all([
    loadCycleRibbonDays(day, rules),
    loadShiftRange(weekStart, weekEnd, rules),
    prisma.activity.findMany({
      where: { startDay: { gte: weekStart, lte: weekEnd } },
      select: { startDay: true, distanceM: true, type: true },
    }),
    prisma.activity.findFirst({ orderBy: { startedAt: "desc" } }),
    loadTodaysWorkout(day),
    loadWeeklyVolumeTargetKm(day),
    prisma.user.findFirst({ select: { weeklyVolumeKm: true } }),
    loadNextGoal(),
    readPhotoManifest(),
    getProfileStatus(),
  ]);

  const todayRibbon = ribbonDays.find((d) => d.day === day);
  const todayShift = weekRange.byDay.get(day);

  // Chrono visé en fourchette (Goal.targetTimeMinS/targetTimeMaxS) — jamais
  // un point unique, cf. lib/utils.ts formatTimeRange.
  const nextGoalTargetRange = nextGoal
    ? formatTimeRange(nextGoal.targetTimeMinS, nextGoal.targetTimeMaxS, formatClock)
    : null;

  const moment = momentForContext({
    shiftCode: todayShift?.resolved.code ?? null,
    isWorking: todayShift?.resolved.isWorking ?? false,
    hour: currentHour(),
  });
  const photo = pickPhoto(day, moment, manifest);

  const todayPhrase = todayShift
    ? buildTodayPhrase({
        isWorking: todayShift.resolved.isWorking,
        shiftLabel: todayRibbon?.label ?? "Repos",
        windows: todayShift.availability.windows,
      })
    : "";

  // Semaine : uniquement la course à pied (le vélo a sa propre unité, cf.
  // lib/utils.ts formatSpeed) — cohérent avec la cible hebdomadaire, elle
  // aussi exprimée en km de course.
  const runKmByDay = new Map<string, number>();
  for (const a of weekActivities) {
    if (!isRun(a.type)) continue;
    runKmByDay.set(a.startDay, (runKmByDay.get(a.startDay) ?? 0) + a.distanceM / 1000);
  }
  const weekTotalKm = [...runKmByDay.values()].reduce((s, v) => s + v, 0);
  const maxDayKm = Math.max(1, ...weekDays.map((d) => runKmByDay.get(d) ?? 0));
  const target = weeklyTargetKm ?? user?.weeklyVolumeKm ?? null;
  // Vélo à part, jamais additionné à la course : cf. lib/metrics/volume.ts.
  const weekRideKm = computeSportVolume(weekActivities).rideKm;

  const [lastActivityZones, lastActivityTracePath] = await Promise.all([
    lastActivity ? loadZoneSecondsByActivity([lastActivity.id]) : Promise.resolve(new Map()),
    lastActivity ? getTracePath(lastActivity.id) : Promise.resolve(null),
  ]);
  const hrZones =
    profileStatus.thresholdHr != null
      ? computeHeartRateZones(profileStatus.thresholdHr, profileStatus.profile?.hrMax ?? null)
      : undefined;

  return (
    <div className="mx-auto max-w-[1100px] space-y-4 p-4 md:space-y-6 md:p-6">
      <PhotoHero photo={photo} height={196}>
        {todayPhrase ? (
          <p className="text-sm text-[var(--color-text)]">{todayPhrase}</p>
        ) : null}
        <p className="text-hero-number text-hero-xl mt-1">{todaysWorkout?.title ?? "Repos"}</p>
        {todaysWorkout?.description ? (
          <p className="mt-1 text-sm text-[var(--color-text)]">{todaysWorkout.description}</p>
        ) : null}
      </PhotoHero>

      <CycleRibbon days={ribbonDays} />

      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <Card className="p-4">
          <h2 className="text-sm font-medium text-[var(--color-muted)]">Cette semaine</h2>
          <div className="mt-3 flex items-end gap-2">
            {weekDays.map((d) => {
              const km = runKmByDay.get(d) ?? 0;
              const isToday = d === day;
              const shiftCode = ribbonDays.find((r) => r.day === d)?.code ?? null;
              return (
                <div key={d} className="flex flex-1 flex-col items-center gap-1">
                  {/* La hauteur en % de la barre a besoin d'un ancêtre à
                      hauteur EXPLICITE (pixels) pour se résoudre : posée sur
                      la ligne du dessus avec `items-end` (donc pas étirée),
                      elle retombait sur "auto" et les barres restaient des
                      traits plats quel que soit le volume réel. */}
                  <div className="flex h-24 w-full items-end">
                    <div
                      className="w-full rounded-t-[2px]"
                      style={{
                        height: `${(km / maxDayKm) * 100}%`,
                        minHeight: km > 0 ? 3 : 0,
                        backgroundColor: isToday ? "var(--color-signal)" : "var(--color-accent)",
                      }}
                    />
                  </div>
                  <span
                    className="text-[10px]"
                    style={{ color: isToday ? "var(--color-signal)" : "var(--color-faint)" }}
                  >
                    {shiftCode ?? "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>
        <HeroStat
          label="Semaine"
          value={weekTotalKm}
          decimals={2}
          unit="km"
          size="md"
          trend={
            [
              target != null ? `sur ${fixed(target, 0)} km visés` : null,
              // Vélo affiché à part, jamais mélangé au volume de course.
              weekRideKm > 0 ? `+ ${fixed(weekRideKm, 1)} km vélo` : null,
            ]
              .filter(Boolean)
              .join(" · ") || undefined
          }
        />
      </div>

      {lastActivity ? (
        <Link href={{ pathname: `/activites/${lastActivity.id}` }} className="block">
          <Card interactive className="flex items-center gap-4 p-4">
            <TraceThumb tracePath={lastActivityTracePath} type={lastActivity.type} size={80} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {normalizeActivityName(lastActivity.name, lastActivity.type, toLocalHour(lastActivity.startedAt))}
              </p>
              <div className="tabular mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-muted)]">
                <span>{formatDistance(lastActivity.distanceM)}</span>
                <span>{formatClock(lastActivity.movingTimeS)}</span>
                {isRun(lastActivity.type) ? (
                  <span>{formatPace(paceFromSpeed(lastActivity.avgSpeedMps))}</span>
                ) : lastActivity.avgHr ? (
                  <span>{lastActivity.avgHr} bpm</span>
                ) : null}
              </div>
              <ZoneBar
                secondsByZone={lastActivityZones.get(lastActivity.id) ?? null}
                zones={hrZones}
                legend={false}
                className="mt-2 max-w-xs"
              />
            </div>
          </Card>
        </Link>
      ) : (
        <Card className="p-4">
          <p className="text-sm text-[var(--color-muted)]">
            Aucune activité. Le plan prévoit peut-être une sortie aujourd&apos;hui — voir
            plus haut.
          </p>
        </Card>
      )}

      {nextGoal ? (
        <Card className="p-4">
          <h2 className="text-sm font-medium text-[var(--color-muted)]">Prochaine course</h2>
          <div className="tabular mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <span className="text-hero-number text-hero-md">{diffDays(day, nextGoal.day)}</span>
            <span className="text-xs text-[var(--color-faint)]">jours · {nextGoal.name}</span>
          </div>
          <p className="tabular mt-1 text-xs text-[var(--color-muted)]">
            {formatDistance(nextGoal.distanceM)}
            {nextGoalTargetRange ? ` · objectif ${nextGoalTargetRange}` : ""}
          </p>
        </Card>
      ) : null}
    </div>
  );
}
