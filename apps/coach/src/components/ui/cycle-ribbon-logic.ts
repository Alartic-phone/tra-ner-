import type { FreeWindow } from "../../lib/shifts/availability.ts";
import type { Day } from "../../lib/shifts/day.ts";

/**
 * Forme d'un jour telle que produite par `loadCycleRibbonDays`
 * (lib/shifts/repository.ts) : poste résolu, créneaux libres, activité du
 * jour. Vivait à l'origine à côté du composant `<CycleRibbon />` (ruban de
 * 21 jours) qui la consommait — ce composant a été retiré par la refonte de
 * l'accueil (remplacé par l'agenda 7 jours) et sa logique de rendu purgée
 * avec lui, mais ce type reste la forme de données réelle que consomment
 * l'en-tête et l'agenda.
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
