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

/**
 * Fourchette de chrono visé : "1 h 03 – 1 h 07", ou la seule borne si elle
 * sont égales (objectif pas encore élargi depuis un unique chrono visé).
 * `null` sans borne renseignée — jamais une fourchette inventée à partir
 * d'un seul chiffre.
 */
export function formatTimeRange(
  minS: number | null | undefined,
  maxS: number | null | undefined,
  formatter: (seconds: number | null | undefined) => string = formatDuration,
): string | null {
  if (minS == null || maxS == null) return null;
  if (minS === maxS) return formatter(minS);
  return `${formatter(minS)} – ${formatter(maxS)}`;
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

/**
 * Répartit des quantités en pourcentages arrondis dont la somme vaut
 * exactement 100 — méthode du plus grand reste.
 *
 * Arrondir chaque part indépendamment (`Math.round` part par part) ne tombe
 * juste que par coïncidence : cinq zones à 21 %, 28 %, 25 %, 25 % et 3 %
 * peuvent très bien sommer à 102. On arrondit d'abord tout à l'entier
 * inférieur, puis on distribue les points de pourcentage manquants aux parts
 * dont le résidu (partie décimale perdue) est le plus grand — c'est elles qui
 * ont le plus « droit » à l'arrondi supérieur.
 *
 * Renvoie des zéros si la somme des quantités est nulle ou négative.
 */
export function distributePercentages(values: readonly number[]): number[] {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) return values.map(() => 0);

  const raw = values.map((v) => (v / total) * 100);
  const floors = raw.map((v) => Math.floor(v));
  const remainders = raw.map((v, i) => v - floors[i]!);
  let missing = 100 - floors.reduce((sum, v) => sum + v, 0);

  const byLargestRemainder = remainders
    .map((r, i) => i)
    .sort((a, b) => remainders[b]! - remainders[a]!);

  const result = [...floors];
  for (const i of byLargestRemainder) {
    if (missing <= 0) break;
    result[i]! += 1;
    missing--;
  }
  return result;
}
