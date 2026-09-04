"use client";

import { useState, useTransition } from "react";
import { saveActivityNote } from "@/app/(app)/activites/[id]/actions.ts";

/** Notes libres, éditables en place. Sauvegarde au blur — pas de bouton, pas de mode édition séparé. */
export function ActivityNotes({ activityId, initialNotes }: { activityId: string; initialNotes: string | null }) {
  const [value, setValue] = useState(initialNotes ?? "");
  const [saved, setSaved] = useState(initialNotes ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleBlur() {
    if (value === saved) return;
    startTransition(async () => {
      const result = await saveActivityNote(activityId, value);
      if (result.ok) {
        setSaved(value);
        setError(null);
      } else {
        setError(result.error);
      }
    });
  }

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={handleBlur}
        placeholder="Notes libres sur cette sortie…"
        rows={3}
        className="w-full resize-y rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
      />
      <p className="mt-1 text-[11px] text-[var(--color-faint)]">
        {isPending ? "Enregistrement…" : error ? <span className="text-[var(--color-danger)]">{error}</span> : "Sauvegarde automatique en quittant le champ."}
      </p>
    </div>
  );
}
