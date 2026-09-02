import { addDays, mondayOf, type Day } from "../shifts/day.ts";

/**
 * Série hebdomadaire : nombre de semaines consécutives (lundi-dimanche)
 * comportant au moins une activité, en remontant depuis la semaine
 * courante. La semaine en cours compte dès la première activité, qu'elle
 * soit terminée ou non — pas besoin d'attendre dimanche pour la valider.
 *
 * Symétriquement, une semaine en cours qui n'a PAS ENCORE d'activité ne casse
 * pas la série : elle n'est pas terminée, il reste du temps pour courir avant
 * dimanche. On ignore alors cette seule semaine et on reprend le compte à la
 * précédente — sans quoi la série retomberait à zéro chaque lundi matin avant
 * la première sortie de la semaine, y compris au milieu d'une série continue.
 */
export function computeWeekStreak(activityDays: readonly Day[], today: Day): number {
  const weeksWithActivity = new Set(activityDays.map((d) => mondayOf(d)));

  let cursor = mondayOf(today);
  if (!weeksWithActivity.has(cursor)) {
    cursor = addDays(cursor, -7);
  }

  let streak = 0;
  while (weeksWithActivity.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -7);
  }
  return streak;
}
