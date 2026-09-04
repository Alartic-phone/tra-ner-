import type { Day } from "./day.ts";

/**
 * Un bloc de postes suivi de sa période de repos.
 * `sequence` est une suite de codes d'un caractère ("M", "A", "N"…), un par
 * jour travaillé. `restDays` est le nombre de jours de repos qui suivent.
 */
export type ShiftBlock = {
  sequence: string;
  restDays: number;
};

/**
 * Définition complète du cycle. Stockée en base (ShiftPattern), jamais codée
 * en dur : la séquence doit rester modifiable depuis les réglages.
 */
export type ShiftCycle = {
  anchorDay: Day;
  blocks: ShiftBlock[];
};

/** Un code de poste et son horaire, tel que saisi dans les réglages. */
export type ShiftTiming = {
  code: string;
  label: string;
  /** "HH:mm" */
  startTime: string;
  /** "HH:mm". Peut être antérieur à `startTime` : le poste passe minuit. */
  endTime: string;
  isWork: boolean;
  color?: string;
};

/** Écart ponctuel au cycle. `code === null` signifie « repos ce jour-là ». */
export type ShiftExceptionInput = {
  day: Day;
  code: string | null;
  note?: string | null;
};

/** État résolu d'une journée : théorie du cycle + exception éventuelle. */
export type ResolvedDay = {
  day: Day;
  /** Code effectivement retenu. `null` = repos. */
  code: string | null;
  /** Ce que prévoyait le cycle, avant exception. */
  theoreticalCode: string | null;
  /** Vrai si une exception s'applique ce jour-là. */
  isException: boolean;
  /**
   * Vrai quand l'exception transforme un repos théorique en jour travaillé :
   * c'est la définition d'un remplacement accepté.
   */
  isReplacement: boolean;
  /** Vrai quand l'exception libère un jour théoriquement travaillé. */
  isFreed: boolean;
  isWorking: boolean;
};
