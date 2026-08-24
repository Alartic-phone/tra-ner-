"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { resumeBackfill, syncNow, type SyncResult } from "@/app/(app)/reglages/actions.ts";
import { Button } from "@/components/ui/button.tsx";

/**
 * Déclenchement manuel de la synchronisation. Le compte rendu est explicite,
 * y compris quand le quota Strava impose une pause : une file qui attend
 * n'est pas une file en échec, et l'interface doit le dire.
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

  function run(action: () => Promise<SyncResult>) {
    startTransition(async () => setResult(await action()));
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={pendingTransition} onClick={() => run(syncNow)}>
          <RefreshCw
            size={14}
            className={pendingTransition ? "animate-spin" : undefined}
            aria-hidden
          />
          Synchroniser
        </Button>
        {!backfillDone || pending > 0 ? (
          <Button
            variant="outline"
            disabled={pendingTransition}
            onClick={() => run(resumeBackfill)}
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

function describeReport(
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
