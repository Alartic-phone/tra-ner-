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

export function paceFromSpeed(metersPerSecond: number | null | undefined): number | null {
  if (!metersPerSecond || metersPerSecond <= 0) return null;
  return 1000 / metersPerSecond;
}

/**
 * Marqueur d'absence de données. À utiliser partout où une métrique peut
 * manquer : on affiche « non disponible », jamais une estimation silencieuse.
 */
export const NA = "non disponible";
