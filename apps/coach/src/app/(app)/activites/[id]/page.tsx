import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db.ts";
import { availableStreams, loadStreams, toChartPoints } from "@/lib/streams.ts";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card.tsx";
import { ActivityCharts } from "@/components/activities/activity-charts-lazy.tsx";
import { RouteMap } from "@/components/activities/route-map.tsx";
import { RecordCelebration } from "@/components/activities/record-celebration.tsx";
import { formatClock, formatDistance, formatPace, formatSpeed, paceFromSpeed } from "@/lib/utils.ts";
import { TRIMP_METHOD_LABELS, type TrimpMethod } from "@/lib/metrics/trimp.ts";
import { decouplingVerdict } from "@/lib/metrics/decoupling.ts";
import { getProfileStatus, loadPersonalRecords } from "@/lib/metrics/repository.ts";
import { computeHeartRateZones } from "@/lib/metrics/zones.ts";
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

  return (
    <div className="p-4 md:p-6">
      <Link
        href="/activites"
        className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:underline"
      >
        <ArrowLeft size={13} aria-hidden /> Activités
      </Link>

      <header className="mt-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{activity.name}</h1>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            {formatInstant(activity.startedAt)} · {activity.type} · poste du jour :{" "}
            {shiftLabel}
          </p>
        </div>
        {activity.plannedWorkout ? (
          <Badge tone="info">rattachée à « {activity.plannedWorkout.title} »</Badge>
        ) : null}
      </header>

      <RecordCelebration durations={personalRecords} />

      <Card elevated className="mt-4">
        <CardBody className="grid grid-cols-3 gap-4 sm:gap-6">
          <div>
            <div className="text-[11px] text-[var(--color-muted)]">Distance</div>
            <div className="tabular text-3xl font-bold sm:text-5xl">{formatDistance(activity.distanceM)}</div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--color-muted)]">Temps en mouvement</div>
            <div className="tabular text-3xl font-bold sm:text-5xl">{formatClock(activity.movingTimeS)}</div>
          </div>
          <div>
            <div className="text-[11px] text-[var(--color-muted)]">
              {isRunActivity ? "Allure moyenne" : "Vitesse moyenne"}
            </div>
            <div className="tabular text-3xl font-bold sm:text-5xl">
              {isRunActivity
                ? formatPace(paceFromSpeed(activity.avgSpeedMps))
                : formatSpeed(activity.avgSpeedMps)}
            </div>
          </div>
        </CardBody>
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] border-t border-[var(--color-border)] sm:grid-cols-3 sm:divide-y-0">
          <Stat
            label="FC moyenne"
            value={activity.avgHr ?? <Unavailable />}
            unit={activity.avgHr ? "bpm" : undefined}
          />
          <Stat
            label="D+"
            value={activity.elevationGainM != null ? Math.round(activity.elevationGainM) : <Unavailable />}
            unit={activity.elevationGainM != null ? "m" : undefined}
          />
          <Stat
            label="Charge (TRIMP)"
            value={activity.trimp != null ? Math.round(activity.trimp) : <Unavailable />}
            estimated={activity.trimpMethod !== null && activity.trimpMethod !== "coros_native"}
            hint={
              activity.trimpMethod
                ? TRIMP_METHOD_LABELS[activity.trimpMethod as TrimpMethod]
                : "Aucune source de charge disponible pour cette séance"
            }
          />
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Tracé"
          hint={
            streams?.latlng
              ? "Position GPS seconde par seconde."
              : "Aucune donnée de position pour cette activité."
          }
        />
        <CardBody className="flex justify-center">
          {streams?.latlng ? (
            <RouteMap
              latlng={streams.latlng}
              mapTilerKey={getEnv().MAPTILER_API_KEY}
              width={480}
              height={320}
              className="max-w-md"
            />
          ) : (
            <p className="text-xs text-[var(--color-muted)]">
              <Unavailable reason="Flux de position absent (séance en salle, ou import antérieur à la capture GPS)" />
            </p>
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Flux détaillés"
          hint={
            present.length > 0
              ? `Séries disponibles : ${present.join(", ")}.`
              : "Aucun flux importé pour cette activité."
          }
        />
        <CardBody>
          {points.length > 0 ? (
            <ActivityCharts points={points} hasHr={present.includes("heartrate")} hrZones={hrZones} />
          ) : (
            <p className="text-xs text-[var(--color-muted)]">
              Les flux seconde par seconde ne sont pas encore importés pour cette
              activité. Ils arrivent par la file de synchronisation.
            </p>
          )}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Tours"
          hint="Indispensable pour lire une séance de fractionné."
          action={<Badge>{activity.laps.length} tours</Badge>}
        />
        {activity.laps.length === 0 ? (
          <CardBody>
            <p className="text-xs text-[var(--color-muted)]">
              Les tours ne sont pas encore importés. Ils arrivent avec le détail de
              l&apos;activité.
            </p>
          </CardBody>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
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
              <tbody className="tabular">
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
      </Card>

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
          <CardBody>
            <p className="text-xs text-[var(--color-muted)]">
              Les métriques de cette activité n&apos;ont pas encore été calculées.
              Lancer le calcul depuis la page Analyses.
            </p>
          </CardBody>
        ) : null}
      </Card>
    </div>
  );
}
