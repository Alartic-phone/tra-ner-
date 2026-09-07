import Link from "next/link";
import { Settings } from "lucide-react";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { loadCycleRibbonDays } from "@/lib/shifts/repository.ts";
import { today, formatDayLong } from "@/lib/time.ts";
import { ThemeToggle } from "@/components/theme-toggle.tsx";
import { getThemePreference } from "@/lib/theme.ts";

/**
 * En-tête fin et collant, sur toute la largeur — remplace le menu latéral et
 * la barre du bas retirés par la refonte (section 2 du cahier des charges).
 * Le monogramme + le titre ramènent à l'accueil ; l'icône Réglages est le
 * seul autre lien de navigation porté par l'en-tête (aucun accès à
 * /reglages n'existait ailleurs depuis l'accueil).
 *
 * L'état du cycle affiché est le poste RÉEL du jour (`loadCycleRibbonDays`,
 * déjà utilisé par le ruban) — jamais un « Bloc F/6 » inventé : rien dans le
 * moteur de postes n'expose une telle numérotation de bloc.
 */
export async function AppHeader() {
  const day = today();
  const rules = await getAvailabilityRules();
  const [[todayShift], preference] = await Promise.all([
    loadCycleRibbonDays(day, rules, 0, 0),
    getThemePreference(),
  ]);

  const shiftPhrase =
    todayShift && todayShift.code
      ? `${todayShift.label} ${todayShift.startTime}–${todayShift.endTime}`
      : "Repos";

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-6 py-3">
        <Link href="/" className="flex min-w-0 items-center gap-2.5">
          <span
            aria-hidden
            className="font-display flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--color-accent)] text-xs font-medium text-[var(--color-accent)]"
          >
            C
          </span>
          <span className="font-display truncate text-sm text-[var(--color-text)] sm:text-base">
            Carnet d&apos;entraînement
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-3 text-xs text-[var(--color-muted)] sm:gap-4 sm:text-sm">
          <span className="tabular hidden sm:inline">{formatDayLong(day)}</span>
          <span className="tabular">{shiftPhrase}</span>
          <ThemeToggle preference={preference} />
          <Link
            href="/reglages"
            aria-label="Réglages"
            className="flex h-7 w-7 items-center justify-center rounded-full text-[var(--color-muted)] transition-colors duration-[var(--duration-fast)] hover:text-[var(--color-text)]"
          >
            <Settings size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </header>
  );
}
