"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { toggleSessionStatus } from "@/app/(app)/plan/session-actions.ts";
import { cn } from "@/lib/utils.ts";

/**
 * Bascule FAIT / A_FAIRE en un seul appui (cahier des charges §2.3) —
 * réversible, zone de contact ≥ 44×44 px, retour visuel immédiat via
 * `useTransition`. Composant unique réutilisé par le bloc « Aujourd'hui » de
 * l'accueil et par chaque ligne de /plan, pour que le même geste ait
 * toujours le même comportement.
 */
export function SessionDoneToggle({
  sessionId,
  done,
  className,
}: {
  sessionId: string;
  done: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const toggle = () => {
    startTransition(async () => {
      await toggleSessionStatus(sessionId);
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={done}
      aria-label={done ? "Marquer comme à faire" : "Marquer comme fait"}
      onClick={toggle}
      disabled={pending}
      className={cn(
        "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors duration-[var(--duration-fast)] disabled:opacity-60",
        done
          ? "border-[var(--color-ok)] bg-[var(--color-ok)]/15 text-[var(--color-ok)]"
          : "border-[var(--color-border-strong)] text-transparent hover:border-[var(--color-accent)]",
        className,
      )}
    >
      <Check size={18} aria-hidden />
    </button>
  );
}
