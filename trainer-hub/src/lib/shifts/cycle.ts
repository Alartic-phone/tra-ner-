import { addDays, assertDay, diffDays, eachDay, weekdayOf, type Day } from "./day.ts";
import type { ResolvedDay, ShiftCycle, ShiftExceptionInput } from "./types.ts";

/**
 * Moteur de cycle de postes.
 *
 * Le cycle est une suite de blocs « N jours travaillés + M jours de repos »
 * qui se répète indéfiniment à partir d'un jour d'ancrage. Rien n'est spécifique
 * à un cycle particulier : la longueur, le nombre de blocs et les codes sont
 * entièrement pilotés par la définition passée en argument.
 */

export function cycleLength(cycle: ShiftCycle): number {
  return cycle.blocks.reduce((total, b) => total + b.sequence.length + b.restDays, 0);
}

export function validateCycle(cycle: ShiftCycle): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cycle.anchorDay)) {
    errors.push("Le jour d'ancrage doit être au format YYYY-MM-DD.");
  }
  if (cycle.blocks.length === 0) {
    errors.push("Le cycle doit contenir au moins un bloc.");
  }
  cycle.blocks.forEach((block, i) => {
    if (block.sequence.length === 0) {
      errors.push(`Bloc ${i + 1} : la séquence de postes est vide.`);
    }
    if (!Number.isInteger(block.restDays) || block.restDays < 0) {
      errors.push(`Bloc ${i + 1} : le repos doit être un entier positif ou nul.`);
    }
  });
  if (errors.length === 0 && cycleLength(cycle) === 0) {
    errors.push("La longueur totale du cycle est nulle.");
  }
  return errors;
}

/**
 * Position d'un jour dans le cycle, dans [0, cycleLength[.
 * Le modulo est corrigé pour rester positif avant le jour d'ancrage : le cycle
 * est aussi défini dans le passé, ce qui permet d'afficher un historique.
 */
export function offsetInCycle(cycle: ShiftCycle, day: Day): number {
  const len = cycleLength(cycle);
  if (len <= 0) throw new Error("Cycle de longueur nulle.");
  const raw = diffDays(cycle.anchorDay, assertDay(day));
  return ((raw % len) + len) % len;
}

/** Code théorique du jour d'après le seul cycle. `null` = repos. */
export function theoreticalCodeForDay(cycle: ShiftCycle, day: Day): string | null {
  let offset = offsetInCycle(cycle, day);
  for (const block of cycle.blocks) {
    if (offset < block.sequence.length) {
      return block.sequence[offset] ?? null;
    }
    offset -= block.sequence.length;
    if (offset < block.restDays) return null;
    offset -= block.restDays;
  }
  // Inatteignable : offset est borné par la longueur du cycle.
  return null;
}

/** Déroule un cycle complet à partir de son jour d'ancrage. */
export function expandCycle(cycle: ShiftCycle): Array<{ day: Day; code: string | null }> {
  const len = cycleLength(cycle);
  const out: Array<{ day: Day; code: string | null }> = [];
  for (let i = 0; i < len; i++) {
    const day = addDays(cycle.anchorDay, i);
    out.push({ day, code: theoreticalCodeForDay(cycle, day) });
  }
  return out;
}

export type ExceptionMap = ReadonlyMap<Day, string | null>;

export function toExceptionMap(exceptions: readonly ShiftExceptionInput[]): ExceptionMap {
  const map = new Map<Day, string | null>();
  for (const e of exceptions) map.set(e.day, e.code);
  return map;
}

/**
 * Résout une journée : cycle théorique, exception éventuelle, et
 * qualification de l'écart (remplacement accepté ou jour libéré).
 */
export function resolveDay(
  cycle: ShiftCycle,
  day: Day,
  exceptions: ExceptionMap,
): ResolvedDay {
  const theoreticalCode = theoreticalCodeForDay(cycle, day);
  const hasException = exceptions.has(day);
  const code = hasException ? (exceptions.get(day) ?? null) : theoreticalCode;

  return {
    day,
    code,
    theoreticalCode,
    isException: hasException,
    isReplacement: hasException && theoreticalCode === null && code !== null,
    isFreed: hasException && theoreticalCode !== null && code === null,
    isWorking: code !== null,
  };
}

export function resolveRange(
  cycle: ShiftCycle,
  from: Day,
  to: Day,
  exceptions: ExceptionMap,
): ResolvedDay[] {
  return eachDay(from, to).map((day) => resolveDay(cycle, day, exceptions));
}

/**
 * Statistiques de remplacement.
 *
 * Le plan doit être calibré sur la disponibilité RÉELLE, pas sur le cycle
 * théorique : si les périodes de repos sont régulièrement entamées par des
 * remplacements, une planification qui les suppose libres est fausse dès la
 * première semaine.
 */
export type ReplacementStats = {
  from: Day;
  to: Day;
  totalDays: number;
  theoreticalWorkDays: number;
  theoreticalRestDays: number;
  actualWorkDays: number;
  /** Jours de repos théoriques effectivement travaillés. */
  replacementsAccepted: number;
  /** Jours travaillés théoriques finalement libérés. */
  daysFreed: number;
  /** replacementsAccepted / theoreticalRestDays, dans [0, 1]. */
  replacementRate: number;
  /** actualWorkDays / theoreticalWorkDays. > 1 = on travaille plus que prévu. */
  workloadRatio: number;
};

export function computeReplacementStats(
  cycle: ShiftCycle,
  from: Day,
  to: Day,
  exceptions: ExceptionMap,
): ReplacementStats {
  const days = resolveRange(cycle, from, to, exceptions);
  const theoreticalWorkDays = days.filter((d) => d.theoreticalCode !== null).length;
  const theoreticalRestDays = days.length - theoreticalWorkDays;
  const actualWorkDays = days.filter((d) => d.isWorking).length;
  const replacementsAccepted = days.filter((d) => d.isReplacement).length;
  const daysFreed = days.filter((d) => d.isFreed).length;

  return {
    from,
    to,
    totalDays: days.length,
    theoreticalWorkDays,
    theoreticalRestDays,
    actualWorkDays,
    replacementsAccepted,
    daysFreed,
    replacementRate:
      theoreticalRestDays > 0 ? replacementsAccepted / theoreticalRestDays : 0,
    workloadRatio:
      theoreticalWorkDays > 0 ? actualWorkDays / theoreticalWorkDays : 0,
  };
}

/**
 * Contrôle de non-régression du calendrier.
 *
 * Propriété structurante du cycle de référence : sa longueur étant un multiple
 * exact de 7, il se répète à l'identique en jours de semaine. Dans chaque bloc,
 * les trois postes identiques consécutifs doivent donc toujours tomber sur le
 * même triplet de jours de semaine. Cette fonction retourne les violations —
 * une liste vide est la condition de validité du calcul.
 *
 * Le triplet attendu est paramétrable : il vaut par défaut vendredi/samedi/
 * dimanche, valeur imposée par le cycle de référence de l'application.
 */
export function findTripleShiftViolations(
  cycle: ShiftCycle,
  from: Day,
  to: Day,
  expectedFirstWeekday = 5,
): Array<{ day: Day; code: string; weekday: number }> {
  const days = eachDay(from, to);
  const violations: Array<{ day: Day; code: string; weekday: number }> = [];

  for (let i = 0; i + 2 < days.length; i++) {
    const a = days[i] as Day;
    const codeA = theoreticalCodeForDay(cycle, a);
    if (codeA === null) continue;
    const codeB = theoreticalCodeForDay(cycle, days[i + 1] as Day);
    const codeC = theoreticalCodeForDay(cycle, days[i + 2] as Day);
    if (codeA !== codeB || codeB !== codeC) continue;

    // Un quadruplet n'est pas un triplet : on ne contrôle que les séries de
    // longueur exactement 3.
    const before = i > 0 ? theoreticalCodeForDay(cycle, days[i - 1] as Day) : null;
    const after =
      i + 3 < days.length ? theoreticalCodeForDay(cycle, days[i + 3] as Day) : null;
    if (before === codeA || after === codeA) continue;

    const weekday = weekdayOf(a);
    if (weekday !== expectedFirstWeekday) {
      violations.push({ day: a, code: codeA, weekday });
    }
  }
  return violations;
}
