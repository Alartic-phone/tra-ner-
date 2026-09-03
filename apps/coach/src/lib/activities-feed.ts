import { addDays, mondayOf, type Day } from "./shifts/day.ts";

/** Regroupement et statut de correspondance au plan pour /activites. Fonctions PURES, testées. */

export type WeekGroup<T> = { weekStart: Day; weekEnd: Day; items: T[] };

/** Regroupe par semaine ISO (lundi-dimanche), semaines les plus récentes d'abord. */
export function groupByWeek<T extends { startDay: Day }>(items: readonly T[]): WeekGroup<T>[] {
  const map = new Map<Day, T[]>();
  for (const item of items) {
    const weekStart = mondayOf(item.startDay);
    const list = map.get(weekStart);
    if (list) list.push(item);
    else map.set(weekStart, [item]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([weekStart, weekItems]) => ({ weekStart, weekEnd: addDays(weekStart, 6), items: weekItems }));
}

export type PlanMatch = "in-zone" | "out-of-zone";

/**
 * Statut de correspondance au plan d'une activité : verte si la majorité du
 * temps mesuré tombe dans la zone FC prescrite, orange sinon. `null` sans
 * prescription de zone ou sans mesure exploitable — jamais un statut
 * affiché sans base pour le calculer.
 */
export function planMatchStatus(
  targetHrZone: number | null | undefined,
  secondsByZone: readonly number[] | null,
): PlanMatch | null {
  if (targetHrZone == null || !secondsByZone) return null;
  const total = secondsByZone.reduce((s, v) => s + v, 0);
  if (total === 0) return null;
  const inZone = secondsByZone[targetHrZone - 1] ?? 0;
  return inZone / total >= 0.5 ? "in-zone" : "out-of-zone";
}
