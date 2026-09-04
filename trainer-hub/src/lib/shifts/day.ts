/**
 * Arithmétique de jours calendaires sur des chaînes "YYYY-MM-DD".
 *
 * Ce module ne dépend de rien (ni date-fns, ni Next) : c'est la brique de base
 * du moteur de postes, qui doit rester testable et exécutable isolément.
 *
 * Choix d'implémentation : les calculs passent par des timestamps UTC. Une date
 * civile interprétée à minuit UTC puis décalée d'un nombre entier de jours ne
 * peut pas dériver lors d'un changement d'heure, contrairement à la même
 * opération faite sur un Date local. Le fuseau Europe/Paris n'intervient qu'au
 * moment de convertir un INSTANT (départ d'activité) en jour calendaire, ce qui
 * est le rôle de `lib/time.ts`, pas de celui-ci.
 */

export type Day = string;

const DAY_MS = 86_400_000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDay(day: string): boolean {
  if (!DAY_RE.test(day)) return false;
  const ms = Date.parse(`${day}T00:00:00.000Z`);
  if (Number.isNaN(ms)) return false;
  // Rejette les dates inexistantes normalisées par Date.parse (2026-02-30).
  return new Date(ms).toISOString().slice(0, 10) === day;
}

export function assertDay(day: string): Day {
  if (!isValidDay(day)) {
    throw new Error(`Jour calendaire invalide : "${day}" (attendu "YYYY-MM-DD")`);
  }
  return day;
}

export function dayToUtcMs(day: Day): number {
  return Date.parse(`${assertDay(day)}T00:00:00.000Z`);
}

export function utcMsToDay(ms: number): Day {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: Day, n: number): Day {
  return utcMsToDay(dayToUtcMs(day) + n * DAY_MS);
}

/** Nombre de jours de `from` à `to` (positif si `to` est postérieur). */
export function diffDays(from: Day, to: Day): number {
  return Math.round((dayToUtcMs(to) - dayToUtcMs(from)) / DAY_MS);
}

export function compareDays(a: Day, b: Day): number {
  // L'ordre lexicographique d'une date ISO est l'ordre chronologique.
  return a < b ? -1 : a > b ? 1 : 0;
}

export function minDay(a: Day, b: Day): Day {
  return a <= b ? a : b;
}

export function maxDay(a: Day, b: Day): Day {
  return a >= b ? a : b;
}

/** 0 = dimanche … 6 = samedi (convention `Date.getUTCDay`). */
export function weekdayOf(day: Day): number {
  return new Date(dayToUtcMs(day)).getUTCDay();
}

/** Lundi de la semaine contenant `day` (semaines ISO, lundi -> dimanche). */
export function mondayOf(day: Day): Day {
  const wd = weekdayOf(day);
  const back = wd === 0 ? 6 : wd - 1;
  return addDays(day, -back);
}

export function eachDay(from: Day, to: Day): Day[] {
  const out: Day[] = [];
  const n = diffDays(from, to);
  if (n < 0) return out;
  for (let i = 0; i <= n; i++) out.push(addDays(from, i));
  return out;
}

const WEEKDAY_LABELS = [
  "dimanche",
  "lundi",
  "mardi",
  "mercredi",
  "jeudi",
  "vendredi",
  "samedi",
] as const;

export function weekdayLabel(day: Day): string {
  return WEEKDAY_LABELS[weekdayOf(day)] as string;
}

/** "HH:mm" -> minutes depuis minuit. */
export function timeToMinutes(time: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(time);
  if (!m) throw new Error(`Horaire invalide : "${time}" (attendu "HH:mm")`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Horaire hors bornes : "${time}"`);
  return h * 60 + min;
}

export function minutesToTime(minutes: number): string {
  const norm = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
