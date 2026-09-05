import { mondayOf, type Day } from "../shifts/day.ts";
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

/**
 * Volume hebdomadaire course/vélo, en mètres, par lundi de semaine ISO.
 *
 * Une semaine sans activité vaut zéro — c'est une vraie mesure (« rien n'a
 * été enregistré cette semaine-là »), pas une donnée manquante à masquer.
 */
export type WeeklyVolume = { weekStart: Day; runM: number; rideM: number };

export function computeWeeklyVolume(
  activities: ReadonlyArray<{ day: Day; distanceM: number; type: string }>,
): Map<Day, { runM: number; rideM: number }> {
  const byWeek = new Map<Day, { runM: number; rideM: number }>();
  for (const activity of activities) {
    const week = mondayOf(activity.day);
    const entry = byWeek.get(week) ?? { runM: 0, rideM: 0 };
    if (isRun(activity.type)) entry.runM += activity.distanceM;
    else if (isRide(activity.type)) entry.rideM += activity.distanceM;
    byWeek.set(week, entry);
  }
  return byWeek;
}
