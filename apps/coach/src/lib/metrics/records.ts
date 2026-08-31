import { compareDays, type Day } from "../shifts/day.ts";

/**
 * Progression d'un record dans le temps : à chaque fois qu'une activité a
 * égalé ou amélioré le record du moment, son jour, son activité et la valeur
 * atteinte. Generic sur le sens de la comparaison — plus grand est mieux pour
 * une distance, plus petit est mieux pour un chrono — pour servir aussi bien
 * la plus longue sortie que le meilleur temps sur 10 km.
 *
 * Ne fabrique rien : un point n'apparaît dans la progression que s'il
 * correspond à une activité réellement enregistrée.
 */

export type RecordPoint = { day: Day; activityId: string; value: number };

export function computeRecordProgression(
  points: ReadonlyArray<RecordPoint>,
  isImprovement: (candidate: number, currentBest: number) => boolean,
): RecordPoint[] {
  const sorted = [...points].sort((a, b) => compareDays(a.day, b.day));

  const progression: RecordPoint[] = [];
  let best: number | null = null;
  for (const point of sorted) {
    if (best === null || isImprovement(point.value, best)) {
      best = point.value;
      progression.push(point);
    }
  }
  return progression;
}

/** Comparateurs usuels, pour éviter d'inverser le signe à l'appel. */
export const HIGHER_IS_BETTER = (candidate: number, best: number): boolean => candidate > best;
export const LOWER_IS_BETTER = (candidate: number, best: number): boolean => candidate < best;
