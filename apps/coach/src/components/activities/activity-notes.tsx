"use client";

import { useRef, useState, useTransition } from "react";
import { updateActivityNotes } from "@/app/(app)/activites/[id]/actions.ts";

/**
 * Ressenti libre, éditable en place, sauvegardé au blur — pas de bouton
 * « Enregistrer » séparé, la saisie doit rester la plus courte possible.
 */
export function ActivityNotes({
  activityId,
  initialNotes,
}: {
  activityId: string;
  initialNotes: string | null;
}) {
  const [value, setValue] = useState(initialNotes ?? "");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [isPending, startTransition] = useTransition();
  const savedValue = useRef(initialNotes ?? "");

  const handleBlur = () => {
    if (value === savedValue.current) return;
    startTransition(async () => {
      const result = await updateActivityNotes({ activityId, notes: value });
      if (result.ok) {
        savedValue.current = value;
        setStatus("saved");
      } else {
        setStatus("error");
      }
    });
  };

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setStatus("idle");
        }}
        onBlur={handleBlur}
        rows={4}
        placeholder="Ressenti, météo, douleur…"
        className="w-full resize-y rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm text-[var(--color-text)] placeholder:text-[var(--color-faint)]"
      />
      <p className="mt-1 text-[11px] text-[var(--color-faint)]">
        {isPending
          ? "Enregistrement…"
          : status === "saved"
            ? "Enregistré."
            : status === "error"
              ? "Échec de l'enregistrement, réessayer."
              : "Sauvegardé au blur."}
      </p>
    </div>
  );
}
