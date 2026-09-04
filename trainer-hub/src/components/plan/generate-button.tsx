"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { generate, regenerate, type GenerateActionResult } from "@/app/(app)/plan/actions.ts";
import { Button } from "@/components/ui/button.tsx";

export function GenerateButton({
  goalId,
  mode,
}: {
  goalId: string;
  mode: "generate" | "regenerate";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      const action = mode === "generate" ? generate : regenerate;
      const result: GenerateActionResult = await action(goalId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  return (
    <div>
      <Button onClick={run} disabled={pending} variant={mode === "regenerate" ? "outline" : "default"}>
        {pending
          ? "Génération en cours… (peut prendre une minute)"
          : mode === "generate"
            ? "Générer le plan"
            : "Régénérer le plan"}
      </Button>
      {error ? <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p> : null}
    </div>
  );
}
