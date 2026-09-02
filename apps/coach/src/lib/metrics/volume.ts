import { isRide, isRun } from "../strava/mapping.ts";

/**
 * Volume par grande famille de sport, sur un ensemble d'activités déjà
 * filtré sur la période voulue (l'appelant borne la requête en base).
 *
 * Course et vélo sont TOUJOURS additionnés séparément : mélanger les deux
 * dans un même total de kilomètres n'a pas de sens face à une cible
 * hebdomadaire de course, et fausserait silencieusement le volume affiché.
 */
export type SportVolume = {
  runKm: number;
  rideKm: number;
};

export function computeSportVolume(
  activities: ReadonlyArray<{ type: string; distanceM: number }>,
): SportVolume {
  let runM = 0;
  let rideM = 0;
  for (const a of activities) {
    if (isRun(a.type)) runM += a.distanceM;
    else if (isRide(a.type)) rideM += a.distanceM;
  }
  return { runKm: runM / 1000, rideKm: rideM / 1000 };
}
