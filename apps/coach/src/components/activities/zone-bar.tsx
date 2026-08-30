import { ZONE_RAMP } from "@/components/analytics/zone-chart.tsx";

/**
 * Fine barre horizontale segmentée par zone FC — l'information la plus
 * utile pour distinguer une séance facile d'une séance dure d'un coup
 * d'œil. `null`/absence de données = pas de barre du tout, jamais un
 * segment inventé.
 */
export function ZoneBar({
  secondsByZone,
  className,
}: {
  secondsByZone: readonly number[] | null;
  className?: string;
}) {
  const total = secondsByZone?.reduce((sum, s) => sum + s, 0) ?? 0;
  if (!secondsByZone || total === 0) return null;

  return (
    <div className={`flex h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] ${className ?? ""}`}>
      {secondsByZone.map((seconds, i) =>
        seconds > 0 ? (
          <div
            key={i}
            style={{ width: `${(seconds / total) * 100}%`, backgroundColor: ZONE_RAMP[i] }}
          />
        ) : null,
      )}
    </div>
  );
}
