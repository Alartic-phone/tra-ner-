import { formatDuration } from "@/lib/utils.ts";
import { ZONE_RAMP, type HeartRateZone } from "@/lib/metrics/zones.ts";

/**
 * Barre horizontale segmentée par zone FC — l'information la plus utile pour
 * distinguer une séance facile d'une séance dure d'un coup d'œil. `null`/
 * absence de données = pas de barre du tout, jamais un segment inventé.
 *
 * Avec légende chiffrée par défaut (« Z2 · endurance fondamentale · 18 min ») :
 * une barre de zones sans légende est illisible seule. La variante compacte
 * (`legend={false}`) n'est autorisée QU'en ligne de liste, où le survol
 * (`title`) donne le détail — jamais ailleurs.
 */
export function ZoneBar({
  secondsByZone,
  zones,
  legend = true,
  className,
}: {
  secondsByZone: readonly number[] | null;
  /** Requis pour la légende (noms + bornes bpm) ; ignoré si `legend` est faux. */
  zones?: readonly HeartRateZone[];
  legend?: boolean;
  className?: string;
}) {
  const total = secondsByZone?.reduce((sum, s) => sum + s, 0) ?? 0;
  if (!secondsByZone || total === 0) return null;

  const title = zones
    ? zones
        .map((z, i) => [z, secondsByZone[i] ?? 0] as const)
        .filter(([, s]) => s > 0)
        .map(([z, s]) => `Z${z.index} ${z.name} · ${formatDuration(s)}`)
        .join(" · ")
    : undefined;

  return (
    <div className={className}>
      <div
        title={title}
        className={`flex w-full overflow-hidden rounded-[var(--radius-pill)] ${legend ? "h-2" : "h-1.5"}`}
      >
        {secondsByZone.map((seconds, i) =>
          seconds > 0 ? (
            <div key={i} style={{ width: `${(seconds / total) * 100}%`, backgroundColor: ZONE_RAMP[i] }} />
          ) : null,
        )}
      </div>

      {legend && zones ? (
        <ul className="mt-2 space-y-1">
          {zones.map((z, i) => {
            const seconds = secondsByZone[i] ?? 0;
            if (seconds === 0) return null;
            return (
              <li key={z.index} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: ZONE_RAMP[i] }}
                />
                <span className="text-[var(--color-text)]">
                  Z{z.index} · {z.name}
                </span>
                <span className="tabular ml-auto text-[var(--color-faint)]">
                  {formatDuration(seconds)}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}
