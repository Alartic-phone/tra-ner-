import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db.ts";
import { availableStreams, loadStreams, toChartPoints, toGeoSeries } from "@/lib/streams.ts";
import { enrichLaps } from "@/lib/laps.ts";
import { Unavailable } from "@/components/ui/badge.tsx";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card.tsx";
import { StatBand } from "@/components/activities/stat-band.tsx";
import { ZoneSummary } from "@/components/activities/zone-summary.tsx";
import { ActivityInteractive } from "@/components/activities/activity-interactive.tsx";
import { RecordsSection } from "@/components/activities/records-section.tsx";
import { ActivityNotes } from "@/components/activities/activity-notes.tsx";
import { sportColor } from "@/components/activities/activity-icon.tsx";
import type { LapRow } from "@/components/activities/lap-rows-table.tsx";
import { formatPace } from "@/lib/utils.ts";
import { decouplingVerdict } from "@/lib/metrics/decoupling.ts";
import { getProfileStatus, loadActivityBestEfforts } from "@/lib/metrics/repository.ts";
import { computeHeartRateZones, timeInZones } from "@/lib/metrics/zones.ts";
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
  const [streams, shifts, bestEfforts, profileStatus] = await Promise.all([
    loadStreams(activity.id),
    loadShiftRange(activity.startDay, activity.startDay, rules),
    loadActivityBestEfforts(activity.id),
    getProfileStatus(),
  ]);

  const chartPoints = streams ? toChartPoints(streams) : [];
  const geoPoints = streams ? toGeoSeries(streams) : [];
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

  // Répartition du temps par zone POUR CETTE ACTIVITÉ SEULE (pas l'agrégat de
  // période utilisé par la page Analyses) : sert la barre de zones et le
  // verdict de séance ci-dessous.
  const zoneTimes =
    hrZones && streams?.heartrate && streams.time
      ? timeInZones(streams.heartrate, streams.time, hrZones)
      : null;
  const secondsByZone = zoneTimes ? hrZones!.map((z) => zoneTimes.byZone.get(z.index) ?? 0) : null;

  // Verdict construit par le code, pas par un modèle : compare la zone FC
  // cible de la séance planifiée rattachée à cette date au temps réellement
  // passé dans cette zone.
  const zoneVerdict = (() => {
    const targetZone = activity.plannedWorkout?.targetHrZone;
    if (!targetZone || !hrZones || !secondsByZone) return null;
    const zone = hrZones.find((z) => z.index === targetZone);
    const measuredTotal = secondsByZone.reduce((a, b) => a + b, 0);
    if (!zone || measuredTotal === 0) return null;
    const pct = Math.round(((secondsByZone[zone.index - 1] ?? 0) / measuredTotal) * 100);
    return `Séance prescrite en Z${zone.index}, réalisée à ${pct} % en Z${zone.index}.`;
  })();

  const enrichedLaps = enrichLaps(activity.laps);
  const toLapRow = (l: (typeof enrichedLaps)[number]): LapRow => ({
    id: l.id,
    label: l.splitIndex != null ? String(l.splitIndex) : (l.name ?? `Tour ${l.lapIndex + 1}`),
    distanceM: l.distanceM,
    avgSpeedMps: l.avgSpeedMps,
    avgHr: l.avgHr,
    elevationGainM: l.elevationGainM,
    startT: l.startT,
    endT: l.endT,
  });
  const splits = enrichedLaps.filter((l) => l.splitIndex != null).map(toLapRow);
  const manualLaps = enrichedLaps.filter((l) => l.splitIndex == null).map(toLapRow);

  return (
    <div className="pb-6">
      <div className="p-4 md:p-6">
        <Link
          href="/activites"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:underline"
        >
          <ArrowLeft size={13} aria-hidden /> Activités
        </Link>
      </div>

      <ActivityInteractive
        heroPoints={geoPoints}
        mapTilerKey={getEnv().MAPTILER_API_KEY}
        name={activity.name}
        dateLabel={formatInstant(activity.startedAt)}
        shiftLabel={shiftLabel}
        sportType={activity.type}
        chartPoints={chartPoints}
        hasHr={present.includes("heartrate")}
        hrZones={hrZones}
        splits={splits}
        manualLaps={manualLaps}
        isRunActivity={isRunActivity}
        sportColorValue={sportColor(activity.type)}
      >
        <div className="px-4 pt-4 md:px-6">
          <StatBand
            distanceM={activity.distanceM}
            movingTimeS={activity.movingTimeS}
            avgSpeedMps={activity.avgSpeedMps}
            isRunActivity={isRunActivity}
            avgHr={activity.avgHr}
            maxHr={activity.maxHr}
            elevationGainM={activity.elevationGainM}
            avgCadence={activity.avgCadence}
            calories={activity.calories}
            trimp={activity.trimp}
            trimpMethod={activity.trimpMethod}
          />

          {secondsByZone ? (
            <Card className="mt-4">
              <CardHeader title="Zones FC" hint="Répartition du temps de cette séance par zone d'intensité." />
              <CardBody>
                <ZoneSummary zones={hrZones ?? []} secondsByZone={secondsByZone} verdict={zoneVerdict} />
              </CardBody>
            </Card>
          ) : null}
        </div>
      </ActivityInteractive>

      <div className="px-4 md:px-6">
        <RecordsSection efforts={bestEfforts} />

        <Card className="mt-4">
          <CardHeader
            title="Analyse"
            hint="Indicateurs dérivés. Tous sont des modèles appliqués aux flux, pas des mesures de la montre."
          />
          <div className="grid grid-cols-1 divide-y divide-[var(--color-border)] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
            <Stat
              label="Découplage cardiaque (Pa:Hr)"
              value={
                activity.decouplingPct != null ? (
                  `${activity.decouplingPct.toFixed(1)} %`
                ) : (
                  <Unavailable reason="Exige un effort d'au moins 30 min avec allure et fréquence cardiaque" />
                )
              }
              estimated
              tone={
                activity.decouplingPct == null
                  ? "default"
                  : decouplingVerdict(activity.decouplingPct) === "bon"
                    ? "ok"
                    : decouplingVerdict(activity.decouplingPct) === "correct"
                      ? "default"
                      : "warn"
              }
              hint="Sous 5 %, l'endurance aérobie est installée pour cette durée."
            />
            <Stat
              label="Allure ajustée du dénivelé"
              value={
                activity.gapPaceSPerKm != null ? (
                  formatPace(activity.gapPaceSPerKm)
                ) : (
                  <Unavailable reason="Exige les flux de distance et d'altitude" />
                )
              }
              estimated
              hint="Modèle de Minetti (2002). Ne coïncidera pas avec la GAP de Strava, qui utilise un modèle propriétaire."
            />
          </div>
          {activity.metricsComputedAt === null ? (
            <CardBody className="pt-0">
              <p className="text-xs text-[var(--color-muted)]">
                Les métriques de cette activité n&apos;ont pas encore été calculées.
                Lancer le calcul depuis la page Analyses.
              </p>
            </CardBody>
          ) : null}
        </Card>

        <Card className="mt-4">
          <CardHeader title="Notes" hint="Ressenti, météo, douleur — sauvegardé au blur." />
          <CardBody>
            <ActivityNotes activityId={activity.id} initialNotes={activity.notes} />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
