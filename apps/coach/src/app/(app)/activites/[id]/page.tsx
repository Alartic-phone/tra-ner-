import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { prisma } from "@/lib/db.ts";
import { availableStreams, loadStreams, toChartPoints } from "@/lib/streams.ts";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card.tsx";
import { ActivityCharts } from "@/components/activities/activity-charts.tsx";
import { formatClock, formatDistance, formatPace, paceFromSpeed } from "@/lib/utils.ts";
import { formatInstant } from "@/lib/time.ts";
import { loadShiftRange } from "@/lib/shifts/repository.ts";
import { getAvailabilityRules } from "@/lib/settings.ts";

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
  const [streams, shifts] = await Promise.all([
    loadStreams(activity.id),
    loadShiftRange(activity.startDay, activity.startDay, rules),
  ]);

  const points = streams ? toChartPoints(streams) : [];
  const present = availableStreams(streams);
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

      <Card className="mt-4">
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:grid-cols-3 lg:grid-cols-6 lg:divide-y-0">
          <Stat label="Distance" value={formatDistance(activity.distanceM)} />
          <Stat label="Temps en mouvement" value={formatClock(activity.movingTimeS)} />
          <Stat label="Allure moyenne" value={formatPace(paceFromSpeed(activity.avgSpeedMps))} />
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
            hint={activity.trimpMethod ?? "moteur de calcul à venir (phase 4)"}
          />
        </div>
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
            <ActivityCharts points={points} hasHr={present.includes("heartrate")} />
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
                  <th className="px-3 py-2 text-right font-medium">Allure</th>
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
                      {formatPace(paceFromSpeed(lap.avgSpeedMps))}
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
          hint="Découplage cardiaque, allure ajustée du dénivelé et charge : moteur de calcul prévu en phase 4."
        />
        <CardBody>
          <p className="text-xs text-[var(--color-muted)]">
            Ces indicateurs ne sont pas encore calculés. Ils ne sont volontairement
            pas affichés avec une valeur provisoire.
          </p>
        </CardBody>
      </Card>
    </div>
  );
}
