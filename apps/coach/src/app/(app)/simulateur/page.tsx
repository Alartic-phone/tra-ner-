import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { RiegelCalculator } from "@/components/simulator/riegel-calculator.tsx";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card.tsx";
import { ProgressRing } from "@/components/ui/progress-ring.tsx";
import { loadBestEfforts, predictDistance } from "@/lib/metrics/repository.ts";
import { DEFAULT_DISTANCES } from "@/lib/metrics/best-efforts.ts";
import {
  classifyTrajectory,
  computeCriticalSpeed,
  isCriticalSpeedInDomain,
  predictTimeFromCriticalSpeed,
  SOURCE_LABELS,
} from "@/lib/metrics/prediction.ts";
import { addDays } from "@/lib/shifts/day.ts";
import { formatDayLong, today } from "@/lib/time.ts";
import { PageContainer } from "@/components/page-container.tsx";
import {
  fixed,
  formatClock,
  formatDistance,
  formatDuration,
  formatPace,
  formatTimeRange,
} from "@/lib/utils.ts";

export const dynamic = "force-dynamic";

const DISTANCE_LABELS: Record<number, string> = {
  400: "400 m",
  1000: "1 km",
  1609: "1 mile",
  5000: "5 km",
  10000: "10 km",
  21097: "Semi-marathon",
  42195: "Marathon",
};

const TRAJECTORY_TONE = {
  avance: "ok",
  dans_les_temps: "info",
  retard: "warn",
} as const;

const TRAJECTORY_LABEL = {
  avance: "En avance",
  dans_les_temps: "Dans les temps",
  retard: "En retard",
} as const;

export default async function SimulatorPage() {
  const now = today();
  const from = addDays(now, -365);

  const [goal, efforts] = await Promise.all([
    prisma.goal.findFirst({ where: { isActive: true }, orderBy: { createdAt: "desc" } }),
    loadBestEfforts(from, now),
  ]);

  const criticalSpeed = computeCriticalSpeed(efforts);
  const trajectory = goal ? await predictDistance(goal.distanceM, from, now) : null;
  const goalTarget =
    goal?.targetTimeMinS != null && goal.targetTimeMaxS != null
      ? { minS: goal.targetTimeMinS, maxS: goal.targetTimeMaxS }
      : null;
  const goalTargetRange = goal
    ? formatTimeRange(goal.targetTimeMinS, goal.targetTimeMaxS)
    : null;

  return (
    <PageContainer>
      <header>
        <h1 className="font-display text-lg font-semibold">Simulateur</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Prédictions en fourchette, jamais en chiffre unique — trois modèles
          indépendants dont le désaccord est une information.
        </p>
      </header>

      <div className="mt-5 max-w-3xl space-y-5">
        <Card elevated>
          <CardHeader
            title="Trajectoire vers l'objectif"
            hint={
              goal
                ? `${goal.name} — ${formatDistance(goal.distanceM)} le ${formatDayLong(goal.day)}`
                : undefined
            }
          />
          <CardBody>
            {!goal ? (
              <p className="text-xs text-[var(--color-muted)]">
                Aucun objectif actif.{" "}
                <Link href="/plan" className="underline">
                  En définir un
                </Link>
                .
              </p>
            ) : !trajectory ? (
              <p className="text-xs text-[var(--color-muted)]">
                Prédiction <Unavailable reason="Aucun meilleur effort sur les 365 derniers jours" /> —{" "}
                {efforts.length === 0
                  ? "aucun meilleur effort exploitable sur la période."
                  : "les modèles disponibles à partir des efforts de référence tombent hors du domaine de plausibilité (allure entre 3'00 et 12'00/km) pour cette distance."}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-5">
                <ProgressRing
                  value={trajectory.confidence}
                  tone={trajectory.confidence >= 0.7 ? "ok" : trajectory.confidence >= 0.4 ? "warn" : "danger"}
                  label="Confiance"
                >
                  <span className="tabular text-lg font-semibold">
                    {Math.round(trajectory.confidence * 100)}%
                  </span>
                </ProgressRing>
                <div className="flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm">
                      Chrono prédit sur {formatDistance(goal.distanceM)} :{" "}
                      <strong className="text-base">{formatDuration(trajectory.medianTimeS)}</strong>{" "}
                      (fourchette {formatDuration(trajectory.fastestTimeS)}–
                      {formatDuration(trajectory.slowestTimeS)})
                    </span>
                    {goalTargetRange ? (
                      <Badge tone={TRAJECTORY_TONE[classifyTrajectory(trajectory.medianTimeS, goalTarget!)]}>
                        {TRAJECTORY_LABEL[classifyTrajectory(trajectory.medianTimeS, goalTarget!)]}
                      </Badge>
                    ) : null}
                  </div>
                  {goalTargetRange ? (
                    <p className="text-xs text-[var(--color-muted)]">
                      Chrono visé : {goalTargetRange}.
                    </p>
                  ) : (
                    <p className="text-xs text-[var(--color-faint)]">
                      Aucun chrono cible défini pour cet objectif — pas de classification possible.
                    </p>
                  )}
                  {trajectory.referenceDay ? (
                    <p className="text-[11px] text-[var(--color-faint)]">
                      Performance de référence : {formatDayLong(trajectory.referenceDay)}.
                    </p>
                  ) : null}
                  {trajectory.confidenceNotes.length > 0 ? (
                    <ul className="list-inside list-disc text-[11px] text-[var(--color-faint)]">
                      {trajectory.confidenceNotes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  ) : null}
                  <ul className="tabular space-y-0.5 text-[11px] text-[var(--color-muted)]">
                    {trajectory.bySource.map((e) => (
                      <li key={e.source}>
                        {SOURCE_LABELS[e.source]} : {formatDuration(e.timeS)}
                      </li>
                    ))}
                    {trajectory.excluded.map((e) => (
                      <li key={e.source} className="text-[var(--color-faint)] line-through">
                        {SOURCE_LABELS[e.source]} : {formatDuration(e.timeS)} — non applicable, hors
                        du domaine de validité
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Vitesse critique — projection"
            hint="Régression distance/temps sur les meilleurs efforts de 2 à 30 minutes, 365 derniers jours."
            action={
              criticalSpeed ? (
                <Badge tone={criticalSpeed.r2 > 0.99 ? "ok" : "warn"}>R² {fixed(criticalSpeed.r2, 3)}</Badge>
              ) : null
            }
          />
          {!criticalSpeed ? (
            <CardBody>
              <p className="text-xs text-[var(--color-muted)]">
                Vitesse critique <Unavailable reason="Moins de trois efforts de référence entre 2 et 30 minutes" />{" "}
                — il faut au moins trois efforts de référence entre 2 et 30 minutes pour établir la
                régression.
              </p>
            </CardBody>
          ) : (
            <>
              <div className="grid grid-cols-2 divide-x divide-[var(--color-border)]">
                <Stat
                  label="Vitesse critique"
                  value={formatPace(1000 / criticalSpeed.csMps)}
                  hint={`${fixed(criticalSpeed.csMps * 3.6, 2)} km/h · ${criticalSpeed.sampleCount} efforts`}
                  estimated
                />
                <Stat
                  label="Réserve anaérobie D′"
                  value={Math.round(criticalSpeed.dPrimeM)}
                  unit="m"
                  hint="distance au-delà de la vitesse critique"
                  estimated
                />
              </div>
              <CardBody className="border-t border-[var(--color-border)]">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                        <th className="px-2 py-2 font-medium">Distance</th>
                        <th className="px-2 py-2 text-right font-medium">Chrono projeté</th>
                      </tr>
                    </thead>
                    <tbody className="tabular">
                      {DEFAULT_DISTANCES.map((distanceM) => {
                        const timeS = predictTimeFromCriticalSpeed(criticalSpeed, distanceM);
                        const inDomain = timeS != null && isCriticalSpeedInDomain(timeS, criticalSpeed);
                        return (
                          <tr key={distanceM} className="border-b border-[var(--color-border)] last:border-0">
                            <td className="px-2 py-1.5">{DISTANCE_LABELS[distanceM] ?? formatDistance(distanceM)}</td>
                            <td
                              className={
                                inDomain
                                  ? "px-2 py-1.5 text-right"
                                  : "px-2 py-1.5 text-right text-[var(--color-faint)]"
                              }
                            >
                              {timeS == null ? (
                                "—"
                              ) : inDomain ? (
                                formatClock(timeS)
                              ) : (
                                <span title={`${formatClock(timeS)} projeté`}>
                                  extrapolation hors domaine
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </>
          )}
        </Card>

        <RiegelCalculator
          initialDistanceM={efforts.length > 0 ? efforts.reduce((b, e) => (e.durationS > b.durationS ? e : b)).distanceM : undefined}
          initialTimeS={efforts.length > 0 ? efforts.reduce((b, e) => (e.durationS > b.durationS ? e : b)).durationS : undefined}
        />
      </div>
    </PageContainer>
  );
}
