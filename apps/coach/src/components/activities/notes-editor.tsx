"use client";

import { useState, useTransition } from "react";
import { saveActivityNotes } from "@/app/(app)/activites/[id]/actions.ts";
import { Button } from "@/components/ui/button.tsx";

export function NotesEditor({ activityId, initialNotes }: { activityId: string; initialNotes: string | null }) {
  const [value, setValue] = useState(initialNotes ?? "");
  const [saved, setSaved] = useState(true);
  const [pending, startTransition] = useTransition();

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        rows={4}
        maxLength={4000}
        placeholder="Sensations, météo, matériel, contexte — ce qui vaut la peine d'être retenu."
        className="w-full resize-y rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus:border-[var(--color-accent)]"
      />
      <div className="mt-2 flex items-center gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || saved}
          onClick={() =>
            startTransition(async () => {
              const result = await saveActivityNotes({ activityId, notes: value });
              if (result.ok) setSaved(true);
            })
          }
        >
          Enregistrer
        </Button>
        {saved ? <span className="text-[11px] text-[var(--color-faint)]">Enregistré</span> : null}
      </div>
    </div>
  );
}
