import { Trophy } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { RecordCelebration } from "@/components/activities/record-celebration.tsx";
import { formatDistance, formatDuration } from "@/lib/utils.ts";
import type { ActivityBestEffort } from "@/lib/metrics/repository.ts";

/**
 * Meilleurs efforts de cette sortie — plus grande distance couverte sur
 * chaque durée de référence (`best-efforts.ts`). `RecordCelebration` assure
 * la mise en évidence des records ; cette liste montre tous les efforts
 * extraits, pas seulement ceux qui battent l'historique.
 */
export function RecordsSection({ efforts }: { efforts: ActivityBestEffort[] }) {
  if (efforts.length === 0) return null;

  const recordDurations = efforts.filter((e) => e.isRecord).map((e) => e.durationS);

  return (
    <Card className="mt-4">
      <CardHeader
        title="Meilleurs efforts"
        hint="Plus grande distance couverte sur chaque durée de référence, dans cette sortie."
      />
      <CardBody>
        <RecordCelebration durations={recordDurations} />
        <div className="divide-y divide-[var(--color-border)]">
          {efforts.map((e) => (
            <div key={e.durationS} className="flex items-center justify-between py-2 text-sm">
              <span className="text-[var(--color-muted)]">{formatDuration(e.durationS)}</span>
              <span className="tabular flex items-center gap-1.5 font-medium">
                {e.isRecord ? <Trophy size={12} className="text-[var(--color-warn)]" aria-hidden /> : null}
                {formatDistance(e.distanceM)}
              </span>
            </div>
          ))}
        </div>
      </CardBody>
    </Card>
  );
}
