"use client";

import { useTransition } from "react";
import { Moon, Sun, SunMoon } from "lucide-react";
import { setThemePreference } from "@/app/theme-actions.ts";
import type { ThemePreference } from "@/lib/theme.ts";
import { cn } from "@/lib/utils.ts";

const NEXT: Record<ThemePreference, ThemePreference> = {
  auto: "dark",
  dark: "light",
  light: "auto",
};

const ICON: Record<ThemePreference, typeof Sun> = {
  auto: SunMoon,
  dark: Moon,
  light: Sun,
};

const LABEL: Record<ThemePreference, string> = {
  auto: "Thème automatique (selon l'heure)",
  dark: "Thème sombre forcé",
  light: "Thème clair forcé",
};

/**
 * Un seul bouton, trois états en boucle : auto -> sombre -> clair -> auto.
 * La préférence est mémorisée côté serveur (cookie, cf. lib/theme.ts) — pas
 * `localStorage`, qui ne s'appliquerait qu'après le premier rendu et
 * provoquerait un flash du mauvais thème.
 */
export function ThemeToggle({ preference }: { preference: ThemePreference }) {
  const [pending, startTransition] = useTransition();
  const Icon = ICON[preference];

  return (
    <button
      type="button"
      aria-label={LABEL[preference]}
      title={LABEL[preference]}
      disabled={pending}
      onClick={() => startTransition(() => setThemePreference(NEXT[preference]))}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-muted)]",
        "transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text)]",
        pending && "opacity-60",
      )}
    >
      <Icon size={14} aria-hidden />
    </button>
  );
}
