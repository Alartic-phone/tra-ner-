"use client";

import { formatDuration } from "@/lib/utils.ts";

export type ZoneRow = {
  index: number;
  name: string;
  seconds: number;
  fromBpm: number;
  toBpm: number;
};

const RAMP = [
  "var(--chart-seq-1)",
  "var(--chart-seq-2)",
  "var(--chart-seq-3)",
  "var(--chart-seq-4)",
  "var(--chart-seq-5)",
];

/**
 * Répartition du temps par zone de fréquence cardiaque.
 *
 * Barres horizontales plutôt qu'un camembert : comparer des longueurs le long
 * d'une base commune est immédiat, comparer des angles ne l'est pas. La rampe
 * est à teinte unique et ordonnée — les zones forment une échelle d'intensité,
 * pas des catégories indépendantes, et un arc-en-ciel suggérerait le contraire.
 *
 * Le temps sans mesure cardiaque n'est PAS réparti au prorata : il est compté
 * à part. Le diluer dans les zones fabriquerait une polarisation qui n'a pas
 * été mesurée.
 */
export function ZoneChart({
  zones,
  unmeasuredSeconds,
  belowZone1Seconds,
  activitiesWithoutHr,
}: {
  zones: ZoneRow[];
  unmeasuredSeconds: number;
  belowZone1Seconds: number;
  activitiesWithoutHr: number;
}) {
  const measured = zones.reduce((sum, z) => sum + z.seconds, 0);
  const max = Math.max(1, ...zones.map((z) => z.seconds));

  if (measured === 0) {
    return (
      <p className="text-xs text-[var(--color-muted)]">
        Aucune donnée de fréquence cardiaque sur la période.
      </p>
    );
  }

  const lowIntensity = zones
    .filter((z) => z.index <= 2)
    .reduce((sum, z) => sum + z.seconds, 0);
  const polarisation = Math.round((lowIntensity / measured) * 100);

  return (
    <div>
      <ul className="space-y-2">
        {zones.map((zone) => {
          const share = (zone.seconds / measured) * 100;
          return (
            <li key={zone.index} className="flex items-center gap-3">
              <span className="w-40 shrink-0 text-xs">
                <span className="text-[var(--color-text)]">
                  Z{zone.index} · {zone.name}
                </span>
                <span className="tabular ml-1 text-[var(--color-faint)]">
                  {zone.fromBpm}–{zone.toBpm}
                </span>
              </span>
              <span className="h-4 min-w-0 flex-1 rounded-sm bg-[var(--color-surface-2)]">
                <span
                  className="block h-4 rounded-sm"
                  style={{
                    width: `${(zone.seconds / max) * 100}%`,
                    backgroundColor: RAMP[zone.index - 1],
                  }}
                />
              </span>
              <span className="tabular w-28 shrink-0 text-right text-xs text-[var(--color-muted)]">
                {formatDuration(zone.seconds)}
                <span className="ml-1.5 text-[var(--color-faint)]">
                  {share.toFixed(0)} %
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs">
        <p className="text-[var(--color-muted)]">
          Basse intensité (Z1-Z2) :{" "}
          <span
            className="tabular font-medium"
            style={{
              color: polarisation >= 75 ? "var(--color-ok)" : "var(--color-warn)",
            }}
          >
            {polarisation} %
          </span>{" "}
          du temps mesuré.
          <span className="text-[var(--color-faint)]">
            {" "}
            L&apos;entraînement polarisé vise environ 80 %.
          </span>
        </p>

        {belowZone1Seconds > 0 ? (
          <p className="mt-1 text-[var(--color-faint)]">
            {formatDuration(belowZone1Seconds)} sous la zone 1 (échauffement,
            marche, récupération entre fractions) — exclus du calcul ci-dessus.
          </p>
        ) : null}

        {unmeasuredSeconds > 0 || activitiesWithoutHr > 0 ? (
          <p className="mt-1 text-[var(--color-warn)]">
            Non réparti faute de mesure :{" "}
            {unmeasuredSeconds > 0 ? formatDuration(unmeasuredSeconds) : null}
            {unmeasuredSeconds > 0 && activitiesWithoutHr > 0 ? ", et " : null}
            {activitiesWithoutHr > 0
              ? `${activitiesWithoutHr} activité${activitiesWithoutHr > 1 ? "s" : ""} sans cardio`
              : null}
            .
          </p>
        ) : null}
      </div>
    </div>
  );
}
