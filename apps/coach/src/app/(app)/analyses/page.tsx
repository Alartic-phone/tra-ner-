import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card.tsx";
import { CountUp } from "@/components/ui/count-up.tsx";
import { AcwrChart, FitnessChart, FormChart } from "@/components/analytics/fitness-chart-lazy.tsx";
import { ZoneChart } from "@/components/analytics/zone-chart.tsx";
import { RecomputeButton } from "@/components/analytics/recompute-button.tsx";
import {
  loadBestEfforts,
  loadFitnessSnapshot,
  loadNextGoal,
  loadPaceZones,
  loadZoneDistribution,
} from "@/lib/metrics/repository.ts";
import { computeCriticalSpeed } from "@/lib/metrics/prediction.ts";
import { addDays } from "@/lib/shifts/day.ts";
import { today } from "@/lib/time.ts";
import { formatDistance, formatDuration, formatPace } from "@/lib/utils.ts";

export const dynamic = "force-dynamic";

const RANGES = [
  { key: "90", label: "3 mois", days: 90 },
  { key: "180", label: "6 mois", days: 180 },
  { key: "365", label: "1 an", days: 365 },
] as const;

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ r?: string }>;
}) {
  const { r } = await searchParams;
  const range = RANGES.find((x) => x.key === r) ?? RANGES[0];
  const now = today();
  const from = addDays(now, -range.days);

  const [snapshot, zones, efforts, paceZones, pendingMetrics, nextGoal] = await Promise.all([
    loadFitnessSnapshot(from, now),
    loadZoneDistribution(from, now),
    loadBestEfforts(from, now),
    loadPaceZones(),
    prisma.activity.count({ where: { metricsComputedAt: null } }),
    loadNextGoal(),
  ]);

  const criticalSpeed = computeCriticalSpeed(efforts);
  const current = snapshot.current;
  const tsbTone =
    current == null ? "default" : current.tsb > 5 ? "ok" : current.tsb < -25 ? "danger" : "default";

  return (
    <div className="p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">Analyses</h1>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            Charge, forme et répartition d&apos;intensité.
          </p>
        </div>
        <RecomputeButton pending={pendingMetrics} />
      </header>

      {snapshot.profileMissing.length > 0 ? (
        <p className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-warn)]/40 px-3 py-2 text-xs text-[var(--color-warn)]">
          Charge non calculable : il manque {snapshot.profileMissing.join(", ")} au
          profil. Le TRIMP de Banister repose sur la réserve cardiaque et sur un
          coefficient qui dépend du sexe.{" "}
          <Link href="/reglages" className="underline">
            Compléter le profil
          </Link>
          .
        </p>
      ) : null}

      {snapshot.activitiesWithoutLoad > 0 ? (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          {snapshot.activitiesWithoutLoad} activité
          {snapshot.activitiesWithoutLoad > 1 ? "s" : ""} de la période sans charge
          calculée — elles comptent pour zéro dans les courbes ci-dessous, ce qui
          sous-estime la charge réelle.
        </p>
      ) : null}

      <div className="mt-3 flex gap-1.5">
        {RANGES.map((option) => (
          <Link
            key={option.key}
            href={{ pathname: "/analyses", query: { r: option.key } }}
            className={`rounded-[var(--radius-pill)] border px-3 py-1 text-xs transition-colors duration-[var(--duration-fast)] ${
              option.key === range.key
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "border-[var(--color-border-strong)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
            }`}
          >
            {option.label}
          </Link>
        ))}
      </div>

      <Card elevated className="mt-4">
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:grid-cols-4 sm:divide-y-0">
          <Stat
            size="lg"
            label="Condition physique"
            value={current ? <CountUp value={Math.round(current.ctl)} /> : <Unavailable />}
            hint="moyenne mobile 42 jours"
            estimated
          />
          <Stat
            size="lg"
            label="Fatigue"
            value={current ? <CountUp value={Math.round(current.atl)} /> : <Unavailable />}
            hint="moyenne mobile 7 jours"
            estimated
          />
          <Stat
            size="lg"
            label="Forme"
            value={current ? <CountUp value={Math.round(current.tsb)} /> : <Unavailable />}
            hint="condition physique − fatigue"
            tone={tsbTone}
            estimated
          />
          <Stat
            size="lg"
            label="Ratio aigu/chronique"
            value={
              snapshot.acwr.ratio != null ? (
                <CountUp value={snapshot.acwr.ratio} decimals={2} />
              ) : (
                <Unavailable />
              )
            }
            hint={snapshot.acwr.zone.replace("_", " ")}
            tone={
              snapshot.acwr.zone === "alerte"
                ? "danger"
                : snapshot.acwr.zone === "prudence"
                  ? "warn"
                  : snapshot.acwr.zone === "optimale"
                    ? "ok"
                    : "default"
            }
            estimated
          />
        </div>
      </Card>

      {snapshot.acwr.zone === "alerte" ? (
        <p className="mt-3 rounded-[var(--radius-card)] border border-[var(--color-danger)]/40 px-3 py-2 text-xs text-[var(--color-danger)]">
          Ratio aigu/chronique au-dessus de 1,5 : la progression de charge des sept
          derniers jours est trop brutale par rapport à ce à quoi l&apos;organisme
          est habitué. La semaine à venir doit être allégée.
        </p>
      ) : null}

      <Card className="mt-4">
        <CardHeader
          title="Charge, condition physique et fatigue"
          hint="Toutes trois en unités de TRIMP, donc sur un axe unique. La forme est tracée à part plus bas."
        />
        <CardBody>
          {snapshot.series.length > 0 ? (
            <FitnessChart rows={snapshot.series} raceDay={nextGoal?.day} />
          ) : (
            <p className="text-xs text-[var(--color-muted)]">
              Aucune charge calculée sur {range.label}. Connecter Strava depuis les{" "}
              <Link href="/reglages" className="text-[var(--color-accent)] hover:underline">
                réglages
              </Link>{" "}
              pour importer l&apos;historique.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Forme"
            hint="Positif : frais et disponible. Négatif : en charge. Le zéro est tracé."
          />
          <CardBody>
            {snapshot.series.length > 0 ? (
              <FormChart rows={snapshot.series} />
            ) : (
              <p className="text-xs text-[var(--color-muted)]">
                La forme se déduit de la charge : encore aucune séance calculée sur{" "}
                {range.label}.
              </p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Ratio aigu/chronique"
            hint="Sept jours rapportés à vingt-huit, en moyennes quotidiennes."
          />
          <CardBody>
            {snapshot.acwrSeries.length > 0 ? (
              <AcwrChart rows={snapshot.acwrSeries} />
            ) : (
              <p className="text-xs text-[var(--color-muted)]">
                Le ratio se déduit de la charge : encore aucune séance calculée sur{" "}
                {range.label}.
              </p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Monotonie et contrainte (Foster)"
          hint="Sept derniers jours. Une charge répartie de façon uniforme, sans vraie journée de repos, est plus délétère que la même charge contrastée."
        />
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:grid-cols-3 sm:divide-y-0">
          <Stat label="Charge hebdomadaire" value={Math.round(snapshot.foster.weeklyLoad)} />
          <Stat
            label="Monotonie"
            value={
              snapshot.foster.monotony != null ? (
                snapshot.foster.monotony.toFixed(2)
              ) : (
                <Unavailable reason="Toutes les journées portent la même charge : l'écart-type est nul." />
              )
            }
            hint="alerte au-delà de 2,0"
            tone={snapshot.foster.monotonyWarning ? "warn" : "default"}
          />
          <Stat
            label="Contrainte"
            value={
              snapshot.foster.strain != null ? Math.round(snapshot.foster.strain) : <Unavailable />
            }
            hint="charge × monotonie"
          />
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title="Répartition par zone de fréquence cardiaque"
          hint="Zones de Karvonen, calculées sur la réserve cardiaque."
        />
        <CardBody>
          {zones ? (
            <ZoneChart
              zones={zones.zones}
              unmeasuredSeconds={zones.unmeasuredSeconds}
              belowZone1Seconds={zones.belowZone1Seconds}
              activitiesWithoutHr={zones.activitiesWithoutHr}
            />
          ) : (
            <p className="text-xs text-[var(--color-muted)]">
              Zones non calculables : renseigner la fréquence cardiaque maximale et
              de repos dans le profil.
            </p>
          )}
        </CardBody>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader
            title="Meilleurs efforts"
            hint="Plus grande distance couverte sur chaque durée de référence, extraite des sorties réelles."
          />
          {efforts.length === 0 ? (
            <CardBody>
              <p className="text-xs text-[var(--color-muted)]">
                Aucun effort extrait. Les flux détaillés doivent d&apos;abord être
                importés, puis les métriques calculées.
              </p>
            </CardBody>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                    <th className="px-4 py-2 font-medium">Durée</th>
                    <th className="px-4 py-2 text-right font-medium">Distance</th>
                    <th className="px-4 py-2 text-right font-medium">Allure</th>
                  </tr>
                </thead>
                <tbody className="tabular">
                  {efforts.map((e) => (
                    <tr key={e.durationS} className="border-b border-[var(--color-border)] last:border-0">
                      <td className="px-4 py-1.5">{formatDuration(e.durationS)}</td>
                      <td className="px-4 py-1.5 text-right">{formatDistance(e.distanceM)}</td>
                      <td className="px-4 py-1.5 text-right">
                        {formatPace((e.durationS / e.distanceM) * 1000)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Vitesse critique"
            hint="Régression distance/temps sur les meilleurs efforts de 2 à 30 minutes."
            action={
              criticalSpeed ? (
                <Badge tone={criticalSpeed.r2 > 0.99 ? "ok" : "warn"}>
                  R² {criticalSpeed.r2.toFixed(3)}
                </Badge>
              ) : null
            }
          />
          {criticalSpeed ? (
            <div className="grid grid-cols-2 divide-x divide-[var(--color-border)]">
              <Stat
                label="Vitesse critique"
                value={formatPace(1000 / criticalSpeed.csMps)}
                hint={`${(criticalSpeed.csMps * 3.6).toFixed(2)} km/h · ${criticalSpeed.sampleCount} efforts`}
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
          ) : (
            <CardBody>
              <p className="text-xs text-[var(--color-muted)]">
                Il faut au moins trois efforts de référence entre 2 et 30 minutes
                pour établir la régression. Le modèle n&apos;est pas extrapolé à
                partir de moins.
              </p>
            </CardBody>
          )}
        </Card>
      </div>

      {paceZones ? (
        <Card className="mt-4">
          <CardHeader title="Zones d'allure" hint="Dérivées de la VMA saisie au profil." />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                  <th className="px-4 py-2 font-medium">Zone</th>
                  <th className="px-4 py-2 text-right font-medium">% VMA</th>
                  <th className="px-4 py-2 text-right font-medium">Allure</th>
                </tr>
              </thead>
              <tbody className="tabular">
                {paceZones.map((zone) => (
                  <tr key={zone.name} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="px-4 py-1.5">{zone.name}</td>
                    <td className="px-4 py-1.5 text-right text-[var(--color-muted)]">
                      {Math.round(zone.fromVmaPct * 100)}–{Math.round(zone.toVmaPct * 100)} %
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      {formatPace(zone.slowestSPerKm)} → {formatPace(zone.fastestSPerKm)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
