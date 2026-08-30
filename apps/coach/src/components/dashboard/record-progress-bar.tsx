import { Trophy } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/card.tsx";
import { CountUp } from "@/components/ui/count-up.tsx";
import { Unavailable } from "@/components/ui/badge.tsx";
import { formatDayLong } from "@/lib/time.ts";

/**
 * Progression du record de plus longue sortie dans le temps. Motivant et ne
 * coûte rien à afficher : c'est un fait déjà mesuré (cf.
 * `loadLongestRunProgression`), pas une estimation.
 */
export function RecordProgressBar({
  progression,
}: {
  progression: readonly { day: string; distanceM: number }[];
}) {
  if (progression.length === 0) {
    return (
      <Card className="p-4">
        <CardHeader title="Plus longue sortie" />
        <p className="px-4 py-3 text-xs">
          <Unavailable reason="Aucune course à pied enregistrée" />
        </p>
      </Card>
    );
  }

  const latest = progression[progression.length - 1]!;
  const previous = progression.length > 1 ? progression[progression.length - 2]! : null;
  const previousKm = previous ? previous.distanceM / 1000 : 0;
  const latestKm = latest.distanceM / 1000;
  const barMax = Math.max(latestKm, previousKm) * 1.1;

  return (
    <Card className="p-4">
      <div className="flex items-center gap-2">
        <Trophy size={16} className="text-[var(--color-warn)]" aria-hidden />
        <h2 className="text-sm font-medium">Plus longue sortie</h2>
      </div>

      <div className="tabular mt-2 flex items-baseline gap-2">
        <span className="text-3xl font-bold">
          {/* Un record ne s'arrondit pas à une décimale : ça a déjà fait
              passer 8,964 km pour 9,0 km. */}
          <CountUp value={latestKm} decimals={2} />
        </span>
        <span className="text-xs text-[var(--color-muted)]">km</span>
        <span className="text-xs text-[var(--color-faint)]">le {formatDayLong(latest.day)}</span>
      </div>

      <div className="mt-3 space-y-1.5">
        <div className="h-2.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-surface-2)]">
          <div
            className="h-2.5 rounded-[var(--radius-pill)] bg-[var(--color-warn)] transition-[width] duration-[var(--duration-slow)] ease-[var(--ease-standard)]"
            style={{ width: `${(latestKm / barMax) * 100}%` }}
          />
        </div>
        {previous ? (
          <div className="h-1.5 w-full overflow-hidden rounded-[var(--radius-pill)] bg-transparent">
            <div
              className="h-1.5 rounded-[var(--radius-pill)] bg-[var(--color-border-strong)]"
              style={{ width: `${(previousKm / barMax) * 100}%` }}
            />
          </div>
        ) : null}
      </div>

      <p className="mt-2 text-[11px] text-[var(--color-faint)]">
        {previous
          ? `Précédent record : ${previousKm.toFixed(2)} km (${formatDayLong(previous.day)}).`
          : "Premier record enregistré."}
      </p>
    </Card>
  );
}
