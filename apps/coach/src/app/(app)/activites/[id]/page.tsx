import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trophy } from "lucide-react";
import { prisma } from "@/lib/db.ts";
import { availableStreams, loadStreams, toChartPoints } from "@/lib/streams.ts";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { HeroStat } from "@/components/ui/hero-stat.tsx";
import { ZoneBar } from "@/components/activities/zone-bar.tsx";
import { ActivityMapAndCharts } from "@/components/activities/activity-map-and-charts.tsx";
import { ActivityNotes } from "@/components/activities/activity-notes.tsx";
import { RecordCelebration } from "@/components/activities/record-celebration.tsx";
import { toggleLapManualForm } from "./actions.ts";
import {
  formatClock,
  formatDistance,
  formatPace,
  formatSpeed,
  paceFromSpeed,
} from "@/lib/utils.ts";
import { TRIMP_METHOD_LABELS, type TrimpMethod } from "@/lib/metrics/trimp.ts";
import { decouplingVerdict } from "@/lib/metrics/decoupling.ts";
import {
  getProfileStatus,
  loadPersonalRecords,
  loadZoneSecondsByActivity,
} from "@/lib/metrics/repository.ts";
import { computeHeartRateZones } from "@/lib/metrics/zones.ts";
import { buildZoneVerdict, fastestSplitIndex } from "@/lib/activity-verdict.ts";
import { formatInstant, toLocalHour } from "@/lib/time.ts";
import { loadShiftRange } from "@/lib/shifts/repository.ts";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { getEnv } from "@/lib/env.ts";
import { isRun } from "@/lib/strava/mapping.ts";
import { normalizeActivityName } from "@/lib/activity-names.ts";

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
  const [streams, shifts, personalRecords, profileStatus, zonesByActivity] = await Promise.all([
    loadStreams(activity.id),
    loadShiftRange(activity.startDay, activity.startDay, rules),
    loadPersonalRecords(activity.id),
    getProfileStatus(),
    loadZoneSecondsByActivity([activity.id]),
  ]);

  const points = streams ? toChartPoints(streams) : [];
  const present = availableStreams(streams);
  const isRunActivity = isRun(activity.type);
  // Musculation, rameur… : Strava ne fournit pas de distance pour ces
  // sports. 0 m serait une distance inventée, pas une mesure — la durée
  // devient la métrique principale à la place.
  const hasDistance = activity.distanceM > 0;
  const displayName = normalizeActivityName(
    activity.name,
    activity.type,
    toLocalHour(activity.startedAt),
  );
  const hrZones =
    profileStatus.thresholdHr != null
      ? computeHeartRateZones(profileStatus.thresholdHr, profileStatus.profile?.hrMax ?? null)
      : null;
  const secondsByZone = zonesByActivity.get(activity.id) ?? null;

  const shiftOfDay = shifts.byDay.get(activity.startDay);
  const shiftLabel = shiftOfDay?.resolved.code
    ? (shifts.timings.find((t) => t.code === shiftOfDay.resolved.code)?.label ??
      shiftOfDay.resolved.code)
    : "repos";

  const splits = activity.laps
    .filter((l) => l.splitIndex != null)
    .sort((a, b) => (a.splitIndex ?? 0) - (b.splitIndex ?? 0));
  const regularLaps = activity.laps.filter((l) => l.splitIndex == null);
  const manualLap = regularLaps.find((l) => l.isManual);
  const otherLaps = regularLaps.filter((l) => !l.isManual);
  const fastestIdx = fastestSplitIndex(
    splits.map((s) => ({ distanceM: s.distanceM, movingTimeS: s.movingTimeS })),
  );
  const maxSplitDuration = Math.max(1, ...splits.map((s) => s.movingTimeS));

  const verdict =
    activity.plannedWorkout?.targetHrZone != null
      ? buildZoneVerdict(activity.plannedWorkout.targetHrZone, secondsByZone)
      : null;

  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="p-4 pb-0 md:p-6 md:pb-0">
        <Link
          href="/activites"
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:underline"
        >
          <ArrowLeft size={13} aria-hidden /> Activités
        </Link>
      </div>

      {/* Bloc dominant : le tracé, jamais une photo sur cette page. */}
      <div className="relative mt-2">
        <ActivityMapAndCharts
          latlng={streams?.latlng ?? []}
          mapTilerKey={getEnv().MAPTILER_API_KEY}
          points={points}
          hasHr={present.includes("heartrate")}
          hrZones={hrZones}
        />
        {streams?.latlng ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] bg-gradient-to-t from-[rgba(8,11,18,0.85)] to-transparent p-4 pt-10">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-lg font-semibold text-[var(--color-text)]">{displayName}</h1>
              {personalRecords.length > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-signal)]/40 bg-[var(--color-signal-bg)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-signal)]">
                  <Trophy size={11} aria-hidden /> record
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs text-[var(--color-text)]">
              {formatInstant(activity.startedAt)} · {activity.type} · poste du jour : {shiftLabel}
            </p>
          </div>
        ) : null}
      </div>

      <div className="space-y-4 p-4 md:space-y-6 md:p-6">
        {!streams?.latlng ? (
          <div>
            <h1 className="text-lg font-semibold">{displayName}</h1>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              {formatInstant(activity.startedAt)} · {activity.type} · poste du jour : {shiftLabel}
            </p>
            {activity.plannedWorkout ? (
              <Badge tone="info" className="mt-2">
                rattachée à « {activity.plannedWorkout.title} »
              </Badge>
            ) : null}
            <p className="mt-2 text-xs text-[var(--color-faint)]">
              <Unavailable reason="Flux de position absent (séance en salle, ou import antérieur à la capture GPS)" />
              {" — pas de tracé pour cette activité."}
            </p>
          </div>
        ) : null}

        <RecordCelebration durations={personalRecords} />

        {/* Bandeau de chiffres : hero-xl puis hero-md, défilement horizontal en mobile. */}
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
          <div className="flex min-w-max gap-3 sm:min-w-0 sm:flex-wrap">
            <HeroStat
              label="Distance"
              value={hasDistance ? activity.distanceM / 1000 : null}
              decimals={2}
              unit="km"
              size="xl"
            />
            <div className="hero-stat-card relative overflow-hidden rounded-[var(--radius-card)] p-4">
              <div className="text-xs text-[var(--color-muted)]">Temps</div>
              <div className="text-hero-number text-hero-xl mt-1">{formatClock(activity.movingTimeS)}</div>
            </div>
            <div className="hero-stat-card relative overflow-hidden rounded-[var(--radius-card)] p-4">
              <div className="text-xs text-[var(--color-muted)]">{isRunActivity ? "Allure" : "Vitesse"}</div>
              <div className="text-hero-number text-hero-xl mt-1">
                {/* Musculation, rameur… : pas de distance mesurée, une allure
                    ou vitesse calculée à partir de 0 m n'aurait aucun sens. */}
                {hasDistance
                  ? isRunActivity
                    ? formatPace(paceFromSpeed(activity.avgSpeedMps))
                    : formatSpeed(activity.avgSpeedMps)
                  : <Unavailable />}
              </div>
            </div>
            <HeroStat label="FC moyenne" value={activity.avgHr} unit="bpm" size="md" />
            <HeroStat label="FC max" value={activity.maxHr} unit="bpm" size="md" />
            <HeroStat
              label="D+"
              value={activity.elevationGainM != null ? Math.round(activity.elevationGainM) : null}
              unit="m"
              size="md"
            />
            <HeroStat
              label="Cadence"
              value={activity.avgCadence != null ? Math.round(activity.avgCadence) : null}
              unit="pas/min"
              size="md"
            />
            <HeroStat
              label="TRIMP"
              value={activity.trimp != null ? Math.round(activity.trimp) : null}
              estimated={activity.trimp != null}
              reason={
                activity.trimpMethod
                  ? TRIMP_METHOD_LABELS[activity.trimpMethod as TrimpMethod]
                  : "Aucune source de charge disponible pour cette séance"
              }
              size="md"
            />
          </div>
        </div>

        <div>
          <h2 className="text-sm font-medium">Zones de fréquence cardiaque</h2>
          <div className="mt-2 max-w-lg">
            <ZoneBar secondsByZone={secondsByZone} zones={hrZones ?? undefined} />
          </div>
        </div>

        {verdict ? (
          <p className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm">
            {verdict}
          </p>
        ) : null}

        {manualLap ? (
          <div className="rounded-[var(--radius-card)] bg-[var(--color-surface)] p-4">
            <p className="text-xs font-medium text-[var(--color-signal)]">Lap manuel</p>
            <p className="tabular mt-1 font-[family-name:var(--font-mono)] text-sm">
              {formatClock(manualLap.movingTimeS)} · {formatDistance(manualLap.distanceM)} ·{" "}
              {isRunActivity ? formatPace(paceFromSpeed(manualLap.avgSpeedMps)) : formatSpeed(manualLap.avgSpeedMps)}
              {manualLap.avgHr != null ? ` · FC ${manualLap.avgHr}` : ""}
            </p>
            <form action={toggleLapManualForm.bind(null, manualLap.id)}>
              <button type="submit" className="mt-2 text-[11px] text-[var(--color-muted)] hover:underline">
                Retirer la mise en avant
              </button>
            </form>
          </div>
        ) : null}

        {splits.length > 0 ? (
          <div>
            <h2 className="text-sm font-medium">Splits kilométriques</h2>
            <div role="list" className="mt-2 space-y-1 font-[family-name:var(--font-mono)] text-xs">
              {splits.map((s, i) => {
                const isFastest = i === fastestIdx;
                const pace = isRunActivity ? formatPace(paceFromSpeed(s.avgSpeedMps)) : formatSpeed(s.avgSpeedMps);
                return (
                  <div
                    key={s.id}
                    role="listitem"
                    tabIndex={0}
                    aria-label={`Kilomètre ${s.splitIndex}, ${pace}${s.avgHr != null ? `, ${s.avgHr} battements par minute` : ""}${isFastest ? ", meilleur kilomètre de la sortie" : ""}`}
                    className="flex items-center gap-2 rounded-[3px] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
                  >
                    <span className="tabular w-6 shrink-0 text-[var(--color-faint)]">{s.splitIndex}</span>
                    <span className="relative h-5 min-w-0 flex-1 overflow-hidden rounded-[3px] bg-[var(--color-surface-2)]">
                      <span
                        className="absolute inset-y-0 left-0 flex items-center rounded-[3px] px-1.5"
                        style={{
                          width: `${(s.movingTimeS / maxSplitDuration) * 100}%`,
                          backgroundColor: isFastest ? "var(--color-signal)" : "var(--color-accent)",
                          color: "var(--color-bg)",
                        }}
                      >
                        {pace}
                      </span>
                    </span>
                    {/* Jamais la couleur seule : le meilleur km porte aussi un mot. */}
                    <span
                      className="w-14 shrink-0 text-[10px] font-medium"
                      style={{ color: isFastest ? "var(--color-signal)" : "transparent" }}
                    >
                      {isFastest ? "meilleur" : ""}
                    </span>
                    <span className="tabular w-16 shrink-0 text-right text-[var(--color-muted)]">
                      {s.avgHr != null ? `${s.avgHr} bpm` : "—"}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {otherLaps.length > 0 ? (
          <div>
            <h2 className="text-sm font-medium">Tours</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                    <th className="px-3 py-2 font-medium">#</th>
                    <th className="px-3 py-2 text-right font-medium">Distance</th>
                    <th className="px-3 py-2 text-right font-medium">Temps</th>
                    <th className="px-3 py-2 text-right font-medium">{isRunActivity ? "Allure" : "Vitesse"}</th>
                    <th className="px-3 py-2 text-right font-medium">FC moy.</th>
                    <th className="px-3 py-2 text-right font-medium"></th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {otherLaps.map((lap) => (
                    <tr key={lap.id} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-3 py-1.5">{lap.lapIndex}</td>
                      <td className="px-3 py-1.5 text-right">{formatDistance(lap.distanceM)}</td>
                      <td className="px-3 py-1.5 text-right">{formatClock(lap.movingTimeS)}</td>
                      <td className="px-3 py-1.5 text-right">
                        {isRunActivity ? formatPace(paceFromSpeed(lap.avgSpeedMps)) : formatSpeed(lap.avgSpeedMps)}
                      </td>
                      <td className="px-3 py-1.5 text-right">{lap.avgHr ?? "—"}</td>
                      <td className="px-3 py-1.5 text-right">
                        <form action={toggleLapManualForm.bind(null, lap.id)}>
                          <button type="submit" className="text-[11px] text-[var(--color-faint)] hover:text-[var(--color-signal)] hover:underline">
                            désigner comme test
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div>
          <h2 className="text-sm font-medium">Analyse</h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            Indicateurs dérivés. Tous sont des modèles appliqués aux flux, pas des mesures de la
            montre.
          </p>
          <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                Découplage cardiaque (Pa:Hr)
                <span className="rounded-[var(--radius-pill)] border border-[var(--color-border-strong)] px-1 text-[10px] leading-4 text-[var(--color-warn)]">
                  est.
                </span>
              </div>
              <div
                className="tabular mt-1 text-xl font-semibold"
                style={{
                  color:
                    activity.decouplingPct == null
                      ? undefined
                      : decouplingVerdict(activity.decouplingPct) === "bon"
                        ? "var(--color-ok)"
                        : decouplingVerdict(activity.decouplingPct) === "correct"
                          ? "var(--color-text)"
                          : "var(--color-warn)",
                }}
              >
                {activity.decouplingPct != null ? (
                  `${activity.decouplingPct.toFixed(1)} %`
                ) : (
                  <Unavailable reason="Exige un effort d'au moins 30 min avec allure et fréquence cardiaque" />
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--color-faint)]">
                Sous 5 %, l&apos;endurance aérobie est installée pour cette durée.
              </p>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
                Allure ajustée du dénivelé
                <span className="rounded-[var(--radius-pill)] border border-[var(--color-border-strong)] px-1 text-[10px] leading-4 text-[var(--color-warn)]">
                  est.
                </span>
              </div>
              <div className="tabular mt-1 text-xl font-semibold">
                {activity.gapPaceSPerKm != null ? (
                  formatPace(activity.gapPaceSPerKm)
                ) : (
                  <Unavailable reason="Exige les flux de distance et d'altitude" />
                )}
              </div>
              <p className="mt-0.5 text-[11px] text-[var(--color-faint)]">
                Modèle de Minetti (2002). Ne coïncidera pas avec la GAP de Strava, qui utilise un
                modèle propriétaire.
              </p>
            </div>
          </div>
          {activity.metricsComputedAt === null ? (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Les métriques de cette activité n&apos;ont pas encore été calculées. Lancer le calcul
              depuis la page Analyses.
            </p>
          ) : null}
        </div>

        <div>
          <h2 className="text-sm font-medium">Notes</h2>
          <div className="mt-2">
            <ActivityNotes activityId={activity.id} initialNotes={activity.notes} />
          </div>
        </div>
      </div>
    </div>
  );
}
