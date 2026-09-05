"use client";

import { distributePercentages, formatDuration } from "@/lib/utils.ts";
import { ZONE_RAMP } from "@/lib/metrics/zones.ts";

export type ZoneRow = {
  index: number;
  name: string;
  seconds: number;
  fromBpm: number;
  toBpm: number;
};

/** Couleur neutre de la ligne « sous Z1 » — en dessous de l'échelle des zones. */
const BELOW_ZONE_1_COLOR = "var(--color-border-strong)";

/**
 * Répartition du temps par zone de fréquence cardiaque.
 *
 * Barres horizontales plutôt qu'un camembert : comparer des longueurs le long
 * d'une base commune est immédiat, comparer des angles ne l'est pas. La rampe
 * est à teinte unique et ordonnée — les zones forment une échelle d'intensité,
 * pas des catégories indépendantes, et un arc-en-ciel suggérerait le contraire.
 *
 * Le temps sous la zone 1 (marche, récupération entre fractions) est une
 * ligne à part entière de la répartition, pas une note en bas de page : sinon
 * il disparaît du total sans que ça se voie. Le temps sans mesure cardiaque,
 * lui, reste hors répartition — il n'a pas été classé, pas seulement classé
 * en bas d'échelle, et le diluer fabriquerait une polarisation non mesurée.
 *
 * Les pourcentages sont répartis par la méthode du plus grand reste
 * (`distributePercentages`) : arrondir chaque part indépendamment ne somme à
 * 100 que par coïncidence.
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
  const rows = [
    ...(belowZone1Seconds > 0
      ? [
          {
            key: "below",
            label: "Sous Z1",
            range: null as string | null,
            seconds: belowZone1Seconds,
            color: BELOW_ZONE_1_COLOR,
          },
        ]
      : []),
    ...zones.map((zone) => ({
      key: String(zone.index),
      label: `Z${zone.index} · ${zone.name}`,
      range: `${zone.fromBpm}–${zone.toBpm}`,
      seconds: zone.seconds,
      color: ZONE_RAMP[zone.index - 1]!,
    })),
  ];

  const measured = rows.reduce((sum, r) => sum + r.seconds, 0);

  if (measured === 0) {
    return (
      <p className="text-xs text-[var(--color-muted)]">
        Aucune mesure de fréquence cardiaque sur la période. La répartition
        apparaît dès qu&apos;une activité avec capteur cardiaque est importée.
      </p>
    );
  }

  const max = Math.max(1, ...rows.map((r) => r.seconds));
  const percentages = distributePercentages(rows.map((r) => r.seconds));

  const lowIntensity =
    belowZone1Seconds + zones.filter((z) => z.index <= 2).reduce((sum, z) => sum + z.seconds, 0);
  const polarisation = Math.round((lowIntensity / measured) * 100);

  return (
    <div>
      <ul className="space-y-2">
        {rows.map((row, i) => (
          <li key={row.key} className="flex items-center gap-3">
            <span className="w-40 shrink-0 text-xs">
              <span className="text-[var(--color-text)]">{row.label}</span>
              {row.range ? (
                <span className="tabular ml-1 text-[var(--color-faint)]">{row.range}</span>
              ) : null}
            </span>
            <span className="h-4 min-w-0 flex-1 rounded-[var(--radius-pill)] bg-[var(--color-surface-2)]">
              <span
                className="block h-4 rounded-[var(--radius-pill)] transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-standard)]"
                style={{
                  width: `${(row.seconds / max) * 100}%`,
                  backgroundColor: row.color,
                }}
              />
            </span>
            <span className="tabular w-28 shrink-0 text-right text-xs text-[var(--color-muted)]">
              {formatDuration(row.seconds)}
              <span className="ml-1.5 text-[var(--color-faint)]">{percentages[i]} %</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-4 border-t border-[var(--color-border)] pt-3 text-xs">
        <p className="text-[var(--color-muted)]">
          Total mesuré :{" "}
          <span className="tabular font-medium text-[var(--color-text)]">
            {formatDuration(measured)}
          </span>{" "}
          — calculé sur les secondes exactes, pas sur la somme des durées
          arrondies ci-dessus : un écart de une ou deux minutes entre les deux
          est un artefact d&apos;arrondi par ligne, pas une donnée perdue.
        </p>

        <p className="mt-1 text-[var(--color-muted)]">
          Basse intensité (sous Z1 et Z1-Z2) :{" "}
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
