import type { Day } from "./shifts/day.ts";

/**
 * Conversions entre instants réels et jours calendaires Europe/Paris.
 *
 * Séparé de `shifts/day.ts` à dessein : le moteur de postes ne manipule que
 * des jours calendaires et n'a besoin d'aucun fuseau. Seule la frontière avec
 * les données horodatées (activités Strava, métriques santé) doit projeter un
 * instant sur un jour, et c'est ici que ça se passe.
 */

export const APP_TIMEZONE = "Europe/Paris";

const dayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Jour calendaire Europe/Paris correspondant à un instant. */
export function toDay(instant: Date): Day {
  // Le format "en-CA" produit nativement "YYYY-MM-DD".
  return dayFormatter.format(instant);
}

export function today(): Day {
  return toDay(new Date());
}

const timeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
});

export function toLocalTime(instant: Date): string {
  return timeFormatter.format(instant);
}

const dateTimeFormatter = new Intl.DateTimeFormat("fr-FR", {
  timeZone: APP_TIMEZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatInstant(instant: Date): string {
  return dateTimeFormatter.format(instant);
}

/** "2026-10-14" -> "mercredi 14 octobre 2026". */
export function formatDayLong(day: Day): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${day}T00:00:00.000Z`));
}

/** "2026-10-14" -> "14 oct." */
export function formatDayShort(day: Day): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  }).format(new Date(`${day}T00:00:00.000Z`));
}

/** "2026-10" -> "octobre 2026". */
export function formatMonth(year: number, month: number): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}
