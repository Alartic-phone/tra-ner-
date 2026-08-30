import { addDays, mondayOf, type Day } from "../shifts/day.ts";

/**
 * Série hebdomadaire : nombre de semaines consécutives (lundi-dimanche)
 * comportant au moins une activité, en remontant depuis la semaine
 * courante. La semaine en cours compte dès la première activité, qu'elle
 * soit terminée ou non — pas besoin d'attendre dimanche pour la valider.
 */
export function computeWeekStreak(activityDays: readonly Day[], today: Day): number {
  const weeksWithActivity = new Set(activityDays.map((d) => mondayOf(d)));

  let streak = 0;
  let cursor = mondayOf(today);
  while (weeksWithActivity.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -7);
  }
  return streak;
}
