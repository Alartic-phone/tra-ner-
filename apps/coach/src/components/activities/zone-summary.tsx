import { ZoneBar } from "@/components/activities/zone-bar.tsx";
import { formatDuration } from "@/lib/utils.ts";
import type { HeartRateZone } from "@/lib/metrics/zones.ts";

/**
 * Zones FC de l'activité : la barre segmentée existante, une ligne « temps en
 * zone » lisible, et un verdict en une phrase quand une séance planifiée est
 * rattachée à cette date — la phrase est construite ici, dans le code, à
 * partir de chiffres mesurés, jamais par un modèle.
 */
export function ZoneSummary({
  zones,
  secondsByZone,
  verdict,
}: {
  zones: readonly HeartRateZone[];
  /** Secondes par zone, alignées sur `zones` (même index). `null` = aucune mesure. */
  secondsByZone: readonly number[] | null;
  verdict: string | null;
}) {
  if (!secondsByZone || zones.length === 0) return null;

  const timeInZoneLabel = zones
    .map((zone, i) => ({ zone, seconds: secondsByZone[i] ?? 0 }))
    .filter((z) => z.seconds > 0)
    .map((z) => `${formatDuration(z.seconds)} en Z${z.zone.index}`)
    .join(" · ");

  return (
    <div>
      <ZoneBar secondsByZone={secondsByZone} />
      {timeInZoneLabel ? (
        <p className="mt-2 text-xs text-[var(--color-muted)]">{timeInZoneLabel}</p>
      ) : null}
      {verdict ? <p className="mt-1 text-xs text-[var(--color-text)]">{verdict}</p> : null}
    </div>
  );
}
