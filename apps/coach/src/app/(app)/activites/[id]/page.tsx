import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db.ts";
import { availableStreams, loadStreams, toChartPoints } from "@/lib/streams.ts";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { HeroStat } from "@/components/ui/hero-stat.tsx";
import { ZoneBar } from "@/components/activities/zone-bar.tsx";
import { ActivityInteractive } from "@/components/activities/activity-interactive.tsx";
import { RecordCelebration } from "@/components/activities/record-celebration.tsx";
import { NotesEditor } from "@/components/activities/notes-editor.tsx";
import { formatClock, formatDistance, formatPace, formatSpeed, paceFromSpeed } from "@/lib/utils.ts";
import { TRIMP_METHOD_LABELS, type TrimpMethod } from "@/lib/metrics/trimp.ts";
import { decouplingVerdict } from "@/lib/metrics/decoupling.ts";
import { getProfileStatus, loadPersonalRecords } from "@/lib/metrics/repository.ts";
import { computeHeartRateZones, timeInZones } from "@/lib/metrics/zones.ts";
import { computeKmSplits } from "@/lib/metrics/splits.ts";
import { formatInstant } from "@/lib/time.ts";
import { loadShiftRange } from "@/lib/shifts/repository.ts";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { getEnv } from "@/lib/env.ts";
import { isRun } from "@/lib/strava/mapping.ts";

export const dynamic = "force-dynamic";

export default async function ActivityPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const activity = await prisma.activity.findUnique({
    where: { id },
    include: { laps: { orderBy: { lapIndex: "asc" } }, plannedWorkout: true },
  });
  if (!activity) notFound();

  const rules = await getAvailabilityRules();
  const [streams, shifts, personalRecords, profileStatus] = await Promise.all([
    loadStreams(activity.id),
    loadShiftRange(activity.startDay, activity.startDay, rules),
    loadPersonalRecords(activity.id),
    getProfileStatus(),
  ]);

  const points = streams ? toChartPoints(streams) : [];
  const present = availableStreams(streams);
  const isRunActivity = isRun(activity.type);
  const hrZones = profileStatus.profile
    ? computeHeartRateZones(profileStatus.profile.hrMax, profileStatus.profile.hrRest)
    : null;
  const shiftOfDay = shifts.byDay.get(activity.startDay);
  const shiftLabel = shiftOfDay?.resolved.code
    ? (shifts.timings.find((t) => t.code === shiftOfDay.resolved.code)?.label ??
      shiftOfDay.resolved.code)
    : "repos";

  const zoneResult =
    hrZones && streams?.heartrate && streams.time ? timeInZones(streams.heartrate, streams.time, hrZones) : null;
  const zoneSeconds = hrZones && zoneResult ? hrZones.map((z) => zoneResult.byZone.get(z.index) ?? 0) : null;

  const splits =
    isRunActivity && streams?.time && streams.distance
      ? computeKmSplits(streams.time, streams.distance, streams.heartrate, streams.altitude)
      : [];

  return (
    <div className="mx-auto max-w-[1100px] p-4 md:p-6">
      <Link
        href="/activites"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:underline"
      >
        <ArrowLeft size={13} aria-hidden /> Activités
      </Link>

      <div className="mt-2">
        <ActivityInteractive
          latlng={streams?.latlng ?? []}
          mapTilerKey={getEnv().MAPTILER_API_KEY}
          points={points}
          hasHr={present.includes("heartrate")}
          hrZones={hrZones}
          heroOverlay={
            <div>
              <h1 className="hero-title text-hero-md text-[var(--color-text)] md:text-hero-lg">
                {activity.name}
              </h1>
              <p className="mt-1 text-xs text-[var(--color-muted)] md:text-sm">
                {formatInstant(activity.startedAt)} · {activity.type} · poste du jour : {shiftLabel}
              </p>
              {activity.plannedWorkout ? (
                <Badge tone="info" className="mt-2">
                  rattachée à « {activity.plannedWorkout.title} »
                </Badge>
              ) : null}
            </div>
          }
        >
          <RecordCelebration durations={personalRecords} />

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
            <HeroStat size="xl" label="Distance" value={formatDistance(activity.distanceM)} />
            <HeroStat size="xl" label="Temps en mouvement" value={formatClock(activity.movingTimeS)} />
            <HeroStat
              size="xl"
              label={isRunActivity ? "Allure moyenne" : "Vitesse moyenne"}
              value={
                isRunActivity
                  ? formatPace(paceFromSpeed(activity.avgSpeedMps))
                  : formatSpeed(activity.avgSpeedMps)
              }
            />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <HeroStat
              size="md"
              label="FC moyenne"
              value={activity.avgHr ?? <Unavailable />}
              unit={activity.avgHr ? "bpm" : undefined}
            />
            <HeroStat
              size="md"
              label="D+"
              value={activity.elevationGainM != null ? Math.round(activity.elevationGainM) : <Unavailable />}
              unit={activity.elevationGainM != null ? "m" : undefined}
            />
            <HeroStat
              size="md"
              label="Cadence"
              value={activity.avgCadence != null ? Math.round(activity.avgCadence) : <Unavailable />}
              unit={activity.avgCadence != null ? "pas/min" : undefined}
            />
            <HeroStat
              size="md"
              label="Charge (TRIMP)"
              value={activity.trimp != null ? Math.round(activity.trimp) : <Unavailable />}
              estimated={activity.trimpMethod !== null && activity.trimpMethod !== "coros_native"}
            />
          </div>

          {zoneSeconds ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-[var(--color-muted)]">
                <span>Zones de fréquence cardiaque</span>
              </div>
              <ZoneBar secondsByZone={zoneSeconds} className="mt-1.5" />
              <div className="tabular mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-[var(--color-faint)]">
                {hrZones!.map((z, i) => (
                  <span key={z.index}>
                    Z{z.index} {formatClock(zoneSeconds[i] ?? 0)}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="mt-4 text-xs text-[var(--color-faint)]">
              <Unavailable reason="Zones non calculables : profil ou flux cardiaque absent" />
            </p>
          )}
        </ActivityInteractive>
      </div>

      {splits.length > 0 ? (
        <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-2 text-sm font-medium">Splits kilométriques</h2>
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[480px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 text-right font-medium">Distance</th>
                  <th className="px-3 py-2 text-right font-medium">Allure</th>
                  <th className="px-3 py-2 text-right font-medium">FC moy.</th>
                  <th className="px-3 py-2 text-right font-medium">D+</th>
                  <th className="px-3 py-2 text-right font-medium">D−</th>
                </tr>
              </thead>
              <tbody>
                {splits.map((s) => (
                  <tr key={s.index} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-1.5">
                      {s.index}
                      {s.partial ? <span className="text-[var(--color-faint)]"> (partiel)</span> : ""}
                    </td>
                    <td className="px-3 py-1.5 text-right">{formatDistance(s.distanceM)}</td>
                    <td className="px-3 py-1.5 text-right">
                      {s.paceSPerKm != null ? formatPace(s.paceSPerKm) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {s.avgHr != null ? Math.round(s.avgHr) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {s.elevGainM != null ? Math.round(s.elevGainM) : "—"}
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      {s.elevLossM != null ? Math.round(s.elevLossM) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-medium">Laps manuels</h2>
          <Badge>{activity.laps.length} tours</Badge>
        </div>
        {activity.laps.length === 0 ? (
          <p className="text-xs text-[var(--color-muted)]">Aucun lap manuel posé sur cette activité.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-muted)]">
                  <th className="px-3 py-2 font-medium">#</th>
                  <th className="px-3 py-2 text-right font-medium">Distance</th>
                  <th className="px-3 py-2 text-right font-medium">Temps</th>
                  <th className="px-3 py-2 text-right font-medium">
                    {isRunActivity ? "Allure" : "Vitesse"}
                  </th>
                  <th className="px-3 py-2 text-right font-medium">FC moy.</th>
                  <th className="px-3 py-2 text-right font-medium">FC max</th>
                </tr>
              </thead>
              <tbody>
                {activity.laps.map((lap) => (
                  <tr key={lap.id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-3 py-1.5">{lap.lapIndex}</td>
                    <td className="px-3 py-1.5 text-right">{formatDistance(lap.distanceM)}</td>
                    <td className="px-3 py-1.5 text-right">{formatClock(lap.movingTimeS)}</td>
                    <td className="px-3 py-1.5 text-right">
                      {isRunActivity
                        ? formatPace(paceFromSpeed(lap.avgSpeedMps))
                        : formatSpeed(lap.avgSpeedMps)}
                    </td>
                    <td className="px-3 py-1.5 text-right">{lap.avgHr ?? "—"}</td>
                    <td className="px-3 py-1.5 text-right">{lap.maxHr ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-2 text-sm font-medium">Analyse</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs text-[var(--color-muted)]">Découplage cardiaque (Pa:Hr)</div>
            <div className="tabular mt-1 text-lg font-semibold">
              {activity.decouplingPct != null ? (
                `${activity.decouplingPct.toFixed(1)} %`
              ) : (
                <Unavailable reason="Exige un effort d'au moins 30 min avec allure et fréquence cardiaque" />
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-[var(--color-faint)]">
              Sous 5 %, l&apos;endurance aérobie est installée pour cette durée.
              {activity.decouplingPct != null
                ? ` Verdict : ${decouplingVerdict(activity.decouplingPct)}.`
                : ""}
            </p>
          </div>
          <div>
            <div className="text-xs text-[var(--color-muted)]">Allure ajustée du dénivelé</div>
            <div className="tabular mt-1 text-lg font-semibold">
              {activity.gapPaceSPerKm != null ? (
                formatPace(activity.gapPaceSPerKm)
              ) : (
                <Unavailable reason="Exige les flux de distance et d'altitude" />
              )}
            </div>
            <p className="mt-0.5 text-[11px] text-[var(--color-faint)]">
              Modèle de Minetti (2002) — ne coïncide pas avec la GAP de Strava.
            </p>
          </div>
        </div>
        {activity.metricsComputedAt === null ? (
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            Les métriques de cette activité n&apos;ont pas encore été calculées. Lancer le calcul
            depuis la page Analyses.
          </p>
        ) : null}
        <p className="mt-3 text-[11px] text-[var(--color-faint)]">
          Séries disponibles : {present.length > 0 ? present.join(", ") : "aucune"}.
        </p>
      </section>

      <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="mb-2 text-sm font-medium">Notes</h2>
        <NotesEditor activityId={activity.id} initialNotes={activity.notes} />
      </section>
    </div>
  );
}
