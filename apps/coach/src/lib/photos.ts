import type { Day } from "./shifts/day.ts";

/**
 * Choix de la photo d'ambiance du jour. Fonction PURE : ni accès disque ni
 * réseau — le manifeste (généré par scripts/fetch-photos.ts) est passé en
 * argument par l'appelant, qui décide comment le lire et quoi faire si le
 * pack est absent (aplat --color-surface, jamais une image en ligne — R6).
 */

export type PhotoMoment = "aube" | "jour" | "soir" | "nuit";

export type PhotoManifestEntry = {
  id: string;
  moment: PhotoMoment;
  file1600: string;
  file800: string;
  blurDataUrl: string;
  source: "unsplash" | "pexels";
  sourceUrl: string;
  author: string;
  authorUrl: string;
  license: string;
};

/**
 * Moment associé à un poste : matin -> aube, après-midi -> jour, nuit ->
 * nuit. Au repos (ou code de poste inconnu), le moment suit l'heure réelle de
 * consultation plutôt que le cycle théorique — un repos se consulte à
 * n'importe quelle heure.
 */
export function momentForContext(input: {
  shiftCode: string | null;
  isWorking: boolean;
  hour: number;
}): PhotoMoment {
  if (input.isWorking) {
    if (input.shiftCode === "M") return "aube";
    if (input.shiftCode === "A") return "jour";
    if (input.shiftCode === "N") return "nuit";
  }
  return momentForHour(input.hour);
}

/** Bornes horaires larges, pensées pour un usage 24 h/24 en poste. */
export function momentForHour(hour: number): PhotoMoment {
  if (hour >= 5 && hour < 11) return "aube";
  if (hour >= 11 && hour < 18) return "jour";
  if (hour >= 18 && hour < 22) return "soir";
  return "nuit";
}

/**
 * Hachage déterministe (djb2) d'un jour calendaire -> entier positif. Aucune
 * prétention cryptographique : sert uniquement à répartir les jours sur les
 * photos disponibles de façon stable et reproductible.
 */
function hashDay(day: Day): number {
  let hash = 5381;
  for (let i = 0; i < day.length; i++) {
    hash = (hash * 33) ^ day.charCodeAt(i);
  }
  return Math.abs(hash);
}

/**
 * Choisit une photo du moment donné, déterministe pour un (jour, moment) :
 * la photo change tous les jours mais reste la même toute la journée, y
 * compris en cas de rechargement ou de navigation. `null` si le pack ne
 * contient aucune photo pour ce moment (pack absent ou incomplet).
 */
export function pickPhoto(
  day: Day,
  moment: PhotoMoment,
  manifest: PhotoManifestEntry[],
): PhotoManifestEntry | null {
  const pool = manifest.filter((p) => p.moment === moment);
  if (pool.length === 0) return null;
  const index = hashDay(day) % pool.length;
  return pool[index]!;
}
