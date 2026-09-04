"use client";

import { useState, useTransition } from "react";
import { Calculator } from "lucide-react";
import { recompute, type RecomputeResult } from "@/app/(app)/analyses/actions.ts";
import { Button } from "@/components/ui/button.tsx";

export function RecomputeButton({ pending }: { pending: number }) {
  const [running, startTransition] = useTransition();
  const [result, setResult] = useState<RecomputeResult | null>(null);

  return (
    <div className="text-right">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          size="sm"
          disabled={running}
          onClick={() => startTransition(async () => setResult(await recompute(false)))}
        >
          <Calculator size={14} aria-hidden />
          Calculer {pending > 0 ? `(${pending} en attente)` : ""}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={running}
          onClick={() => startTransition(async () => setResult(await recompute(true)))}
          title="À lancer après toute modification du profil : FC max, FC de repos ou sexe"
        >
          Tout recalculer
        </Button>
      </div>

      {result ? (
        <p className="mt-2 text-xs text-[var(--color-muted)]">
          {result.ok
            ? result.report.skipped > 0
              ? `${result.report.processed} activité(s) traitée(s), ${result.report.skipped} restante(s) — relancer pour continuer.`
              : `${result.report.processed} activité(s) traitée(s). Tout est à jour.`
            : result.error}
        </p>
      ) : null}
    </div>
  );
}
