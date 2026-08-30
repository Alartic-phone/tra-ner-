import { HeroStat } from "@/components/ui/hero-stat.tsx";
import { Unavailable } from "@/components/ui/badge.tsx";
import { formatClock, formatDistance, formatPace, formatSpeed, paceFromSpeed } from "@/lib/utils.ts";
import { TRIMP_METHOD_LABELS, type TrimpMethod } from "@/lib/metrics/trimp.ts";

/**
 * Bandeau de chiffres de la page activité. Les trois premiers (distance,
 * temps, allure/vitesse) sont LE chiffre de la page (`HeroStat xl`), les
 * suivants sont secondaires (`md`). Défilement horizontal sur mobile plutôt
 * qu'un empilement vertical : ce sont des chiffres à parcourir du pouce,
 * pas du texte à lire de haut en bas.
 */
export function StatBand({
  distanceM,
  movingTimeS,
  avgSpeedMps,
  isRunActivity,
  avgHr,
  maxHr,
  elevationGainM,
  avgCadence,
  calories,
  trimp,
  trimpMethod,
}: {
  distanceM: number;
  movingTimeS: number;
  avgSpeedMps: number | null;
  isRunActivity: boolean;
  avgHr: number | null;
  maxHr: number | null;
  elevationGainM: number | null;
  avgCadence: number | null;
  calories: number | null;
  trimp: number | null;
  trimpMethod: string | null;
}) {
  return (
    <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
      <HeroStat
        className="shrink-0 snap-start basis-[44vw] md:basis-[13rem]"
        size="xl"
        label="Distance"
        value={formatDistance(distanceM)}
      />
      <HeroStat
        className="shrink-0 snap-start basis-[44vw] md:basis-[13rem]"
        size="xl"
        label="Temps en mouvement"
        value={formatClock(movingTimeS)}
      />
      <HeroStat
        className="shrink-0 snap-start basis-[44vw] md:basis-[13rem]"
        size="xl"
        label={isRunActivity ? "Allure moyenne" : "Vitesse moyenne"}
        value={isRunActivity ? formatPace(paceFromSpeed(avgSpeedMps)) : formatSpeed(avgSpeedMps)}
      />
      <HeroStat
        className="shrink-0 snap-start basis-[34vw] md:basis-40"
        size="md"
        label="FC moyenne"
        value={avgHr ?? <Unavailable />}
        unit={avgHr ? "bpm" : undefined}
      />
      <HeroStat
        className="shrink-0 snap-start basis-[34vw] md:basis-40"
        size="md"
        label="FC max"
        value={maxHr ?? <Unavailable />}
        unit={maxHr ? "bpm" : undefined}
      />
      <HeroStat
        className="shrink-0 snap-start basis-[34vw] md:basis-40"
        size="md"
        label="D+"
        value={elevationGainM != null ? Math.round(elevationGainM) : <Unavailable />}
        unit={elevationGainM != null ? "m" : undefined}
      />
      <HeroStat
        className="shrink-0 snap-start basis-[34vw] md:basis-40"
        size="md"
        label="Cadence"
        value={avgCadence != null ? Math.round(avgCadence) : <Unavailable />}
        unit={avgCadence != null ? "pas/min" : undefined}
      />
      <HeroStat
        className="shrink-0 snap-start basis-[34vw] md:basis-40"
        size="md"
        label="Calories"
        value={calories != null ? Math.round(calories) : <Unavailable />}
        unit={calories != null ? "kcal" : undefined}
      />
      <HeroStat
        className="shrink-0 snap-start basis-[34vw] md:basis-40"
        size="md"
        label="Charge (TRIMP)"
        value={trimp != null ? Math.round(trimp) : <Unavailable />}
        estimated={trimpMethod !== null && trimpMethod !== "coros_native"}
        hint={
          trimpMethod
            ? TRIMP_METHOD_LABELS[trimpMethod as TrimpMethod]
            : "Aucune source de charge disponible"
        }
      />
    </div>
  );
}
