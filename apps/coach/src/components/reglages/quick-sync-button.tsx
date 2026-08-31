"use client";

import { useState, useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { syncNow, type SyncResult } from "@/app/(app)/reglages/actions.ts";
import { Button } from "@/components/ui/button.tsx";
import { describeReport } from "@/components/strava/sync-panel.tsx";

/**
 * Point d'entrée unique de la synchronisation manuelle. Ne déclenche que
 * Strava : la COROS n'a pas d'API publique aux particuliers et s'importe à
 * la main (voir la carte « Synchronisation » qui l'affiche à côté, jamais
 * comme si un bouton pouvait la déclencher).
 */
export function QuickSyncButton() {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SyncResult | null>(null);

  return (
    <div>
      <Button
        disabled={pending}
        onClick={() => startTransition(async () => setResult(await syncNow()))}
      >
        <RefreshCw size={14} className={pending ? "animate-spin" : undefined} aria-hidden />
        Synchroniser maintenant
      </Button>

      {result ? (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          {!result.ok
            ? result.error
            : describeReport(
                result.report.stoppedBy,
                result.report.processed,
                result.report.failed,
                result.report.retryAfterS,
              )}
        </p>
      ) : null}
    </div>
  );
}
