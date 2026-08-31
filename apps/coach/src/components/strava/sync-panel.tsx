"use client";

import { useState, useTransition } from "react";
import { resumeBackfill, type SyncResult } from "@/app/(app)/reglages/actions.ts";
import { Button } from "@/components/ui/button.tsx";

/**
 * Reprise de l'import de l'historique. La synchronisation courante a son
 * propre bouton (`QuickSyncButton`, en tête de page) : ce panneau ne gère
 * plus que le cas plus rare de l'historique interrompu, pour éviter deux
 * boutons « Synchroniser » qui feraient la même chose à deux endroits.
 */
export function SyncPanel({
  backfillDone,
  pending,
  failed,
}: {
  backfillDone: boolean;
  pending: number;
  failed: number;
}) {
  const [pendingTransition, startTransition] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);

  if (backfillDone && pending === 0 && failed === 0) return null;

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {!backfillDone || pending > 0 ? (
          <Button
            variant="outline"
            disabled={pendingTransition}
            onClick={() =>
              startTransition(async () => setResult(await resumeBackfill()))
            }
          >
            Reprendre l&apos;import de l&apos;historique
          </Button>
        ) : null}
      </div>

      {result ? (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          {!result.ok
            ? result.error
            : describeReport(result.report.stoppedBy, result.report.processed, result.report.failed, result.report.retryAfterS)}
        </p>
      ) : null}

      {failed > 0 ? (
        <p className="mt-2 text-xs text-[var(--color-danger)]">
          {failed} tâche{failed > 1 ? "s" : ""} en échec définitif après cinq tentatives.
        </p>
      ) : null}
    </div>
  );
}

export function describeReport(
  stoppedBy: string,
  processed: number,
  failed: number,
  retryAfterS?: number,
): string {
  const base = `${processed} tâche${processed > 1 ? "s" : ""} traitée${processed > 1 ? "s" : ""}`;
  const withFailures = failed > 0 ? `${base}, ${failed} en échec` : base;

  switch (stoppedBy) {
    case "empty":
      return `${withFailures}. File vide, tout est à jour.`;
    case "budget":
      return `${withFailures}. Interrompu pour ne pas bloquer la requête — relancer pour continuer.`;
    case "rate_limit":
      return `${withFailures}. Quota Strava atteint, reprise possible dans ${Math.ceil((retryAfterS ?? 0) / 60)} min.`;
    case "auth":
      return `${withFailures}. Jeton Strava refusé : reconnecter le compte.`;
    default:
      return withFailures;
  }
}
