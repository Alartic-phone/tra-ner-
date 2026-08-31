import { mondayOf, type Day } from "../shifts/day.ts";
import { isRide, isRun } from "../strava/mapping.ts";

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
