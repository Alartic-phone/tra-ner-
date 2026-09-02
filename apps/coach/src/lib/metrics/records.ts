import type { Day } from "../shifts/day.ts";

export type DistanceRecord = { day: Day; distanceM: number };

/**
 * Progression du record de distance : pour chaque course qui a battu le
 * record du moment, sa date et sa distance EXACTE en mètres — jamais
 * arrondie ici. C'est à l'affichage de choisir sa précision ; la fabriquer
 * ici ferait perdre un record réel qui s'arrondirait au même nombre que le
 * précédent (8,96 km et 9,00 km ne sont pas la même performance).
 */
export function longestRunProgression(runs: ReadonlyArray<DistanceRecord>): DistanceRecord[] {
  const progression: DistanceRecord[] = [];
  let best = 0;
  for (const run of runs) {
    if (run.distanceM > best) {
      best = run.distanceM;
      progression.push({ day: run.day, distanceM: run.distanceM });
    }
  }
  return progression;
}
