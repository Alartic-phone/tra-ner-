import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Formate une durée en secondes : "1 h 12 min", "42 min", "38 s". */
export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h} h ${String(m).padStart(2, "0")}`;
  if (m > 0) return `${m} min`;
  return `${s} s`;
}

/** Chrono complet : "1:12:34" ou "42:07". */
export function formatClock(seconds: number | null | undefined): string {
  if (seconds == null) return "—";
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return h > 0
    ? `${h}:${mm}:${String(sec).padStart(2, "0")}`
    : `${mm}:${String(sec).padStart(2, "0")}`;
}

/** "1:04:00" ou "45:00" -> secondes. `null` si vide ou mal formé. */
export function parseClock(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parts = trimmed.split(":").map((p) => Number(p));
  if (parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  if (parts.length === 2) return parts[0]! * 60 + parts[1]!;
  if (parts.length === 3) return parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  return null;
}

/** Allure en secondes par kilomètre -> "4'32\"/km". */
export function formatPace(secondsPerKm: number | null | undefined): string {
  if (secondsPerKm == null || !Number.isFinite(secondsPerKm)) return "—";
  const total = Math.round(secondsPerKm);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}'${String(s).padStart(2, "0")}"/km`;
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters == null) return "—";
  return meters >= 1000
    ? `${(meters / 1000).toFixed(2).replace(".", ",")} km`
    : `${Math.round(meters)} m`;
}

/**
 * Distance affichée, ou durée en repli pour un sport sans distance mesurée
 * (musculation, rameur…). 0 m serait une distance inventée, pas une mesure :
 * la durée reste une vraie mesure, elle. Utilisé partout où une distance
 * d'activité s'affiche (carte, page activité, calendrier) pour ne jamais
 * faire diverger cette règle d'un endroit à l'autre.
 */
export function formatDistanceOrDuration(
  distanceM: number,
  movingTimeS: number | null | undefined,
): string {
  return distanceM > 0 ? formatDistance(distanceM) : formatClock(movingTimeS);
}

export function paceFromSpeed(metersPerSecond: number | null | undefined): number | null {
  if (!metersPerSecond || metersPerSecond <= 0) return null;
  return 1000 / metersPerSecond;
}

/**
 * Vitesse en km/h -> "28,4 km/h". Le vélo se lit en vitesse, pas en allure
 * (une "allure" en min/km n'a pas de sens à 30 km/h) — jamais le même champ
 * pour les deux, cf. `isRun`/`RUN_TYPES` dans `lib/strava/mapping.ts` pour
 * décider laquelle afficher selon le type d'activité.
 */
export function formatSpeed(metersPerSecond: number | null | undefined): string {
  if (metersPerSecond == null || !Number.isFinite(metersPerSecond) || metersPerSecond <= 0) {
    return "—";
  }
  return `${(metersPerSecond * 3.6).toFixed(1).replace(".", ",")} km/h`;
}

/**
 * Marqueur d'absence de données. À utiliser partout où une métrique peut
 * manquer : on affiche « non disponible », jamais une estimation silencieuse.
 */
export const NA = "non disponible";
