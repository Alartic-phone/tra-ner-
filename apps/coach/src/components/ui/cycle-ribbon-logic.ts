import { minutesToTime } from "../../lib/shifts/day.ts";
import type { FreeWindow } from "../../lib/shifts/availability.ts";
import type { Day } from "../../lib/shifts/day.ts";
import { fixed } from "../../lib/utils.ts";

/**
 * Logique PURE de <CycleRibbon /> — fenêtrage mobile et textes (infobulle,
 * aria-label). Séparée du composant pour rester testable sans DOM : c'est
 * l'objet le plus important de l'application (CLAUDE.md), il mérite des
 * tests qui ne dépendent pas d'un environnement React.
 */

export type CycleRibbonDay = {
  day: Day;
  /** Code de poste résolu, `null` = repos. */
  code: string | null;
  /** "Matin" | "Après-midi" | "Nuit" | "Repos". */
  label: string;
  startTime: string | null;
  endTime: string | null;
  windows: readonly FreeWindow[];
  /** Une activité a eu lieu ce jour-là. */
  hasActivity: boolean;
  /** Une séance était prévue et n'a pas encore de correspondance réalisée. */
  hasPlannedUndone: boolean;
  isToday: boolean;
  isException: boolean;
};

// Ratio ~1:2 passé/avenir des 21 jours desktop (7 passés, aujourd'hui,
// 13 à venir), réduit à 14 : 4 passés, aujourd'hui, 9 à venir.
export const DESKTOP_PAST_DAYS = 7;
export const DESKTOP_FUTURE_DAYS = 13;
export const MOBILE_PAST_DAYS = 4;
export const MOBILE_FUTURE_DAYS = 9;

/** `indexFromToday` : 0 = aujourd'hui, négatif = passé, positif = avenir. */
export function isVisibleOnMobile(indexFromToday: number): boolean {
  return indexFromToday >= -MOBILE_PAST_DAYS && indexFromToday <= MOBILE_FUTURE_DAYS;
}

function windowsLabel(windows: readonly FreeWindow[]): string {
  if (windows.length === 0) return "Aucun créneau exploitable";
  return windows
    .map((w) => {
      const hours = w.durationMin / 60;
      const hoursLabel = Number.isInteger(hours) ? `${hours} h` : `${fixed(hours, 1)} h`;
      return `${minutesToTime(w.startMin)}–${minutesToTime(w.endMin)} (${hoursLabel})`;
    })
    .join(" · ");
}

/** Texte d'infobulle au survol : poste, horaires, créneaux libres, activités. */
export function buildRibbonTooltip(d: CycleRibbonDay): string {
  const parts: string[] = [];
  parts.push(
    d.code && d.startTime && d.endTime
      ? `${d.label} (${d.startTime}–${d.endTime})`
      : d.label,
  );
  parts.push(`Créneau libre : ${windowsLabel(d.windows)}`);
  if (d.hasActivity) parts.push("Activité réalisée");
  else if (d.hasPlannedUndone) parts.push("Séance prévue, pas encore réalisée");
  return parts.join(". ") + ".";
}

/** aria-label complet, en français, pour un segment du ruban. */
export function buildRibbonAriaLabel(d: CycleRibbonDay): string {
  const prefix = d.isToday ? "Aujourd'hui, " : "";
  const exception = d.isException ? " (remplacement)" : "";
  return `${prefix}${formatDayForAria(d.day)}${exception} : ${buildRibbonTooltip(d)}`;
}

/**
 * Couleur du segment de poste — les 4 variables --color-shift-m/a/n et
 * --color-rest existantes, jamais une autre (contrairement au calendrier
 * mensuel, qui
 * peut afficher une couleur par code personnalisé depuis les réglages). Le
 * ruban reste volontairement à l'échelle du 3×8 : un code hors M/A/N (congé,
 * code personnalisé) y est regroupé visuellement avec le repos.
 */
export function shiftColorVar(code: string | null): string {
  if (code === "M") return "var(--color-shift-m)";
  if (code === "A") return "var(--color-shift-a)";
  if (code === "N") return "var(--color-shift-n)";
  return "var(--color-rest)";
}

function formatDayForAria(day: Day): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(`${day}T00:00:00.000Z`));
}
