import type { FreeWindow } from "./shifts/availability.ts";
import type { AcwrZone } from "./metrics/load.ts";

export type TrainingLoadLabel = { phrase: string; tone: "ok" | "warn" | "danger" | "default" };

const ACWR_ZONE_PHRASES: Record<Exclude<AcwrZone, "indeterminee">, string> = {
  "sous-charge": "en retrait",
  optimale: "en progression maîtrisée",
  prudence: "à surveiller",
  alerte: "progression trop rapide",
};

/**
 * Carte « Charge » de l'accueil (remplace la fraîcheur COROS, retirée le
 * 05/09/2026). `null` = zone indéterminée : historique insuffisant pour
 * qu'un ratio veuille dire quelque chose (cf. computeAcwr) — la carte doit
 * alors se rabattre sur `<Unavailable />` avec sa raison, jamais un verdict
 * affiché sans donnée suffisante. C'est la même règle, appliquée à un
 * nouveau chiffre, que celle qui a fait retirer le badge « Feu vert » de
 * l'ancienne carte Fraîcheur.
 */
export function describeTrainingLoad(zone: AcwrZone): TrainingLoadLabel | null {
  if (zone === "indeterminee") return null;
  const tone =
    zone === "alerte" ? "danger" : zone === "prudence" ? "warn" : zone === "optimale" ? "ok" : "default";
  return { phrase: `Charge · ${ACWR_ZONE_PHRASES[zone]}`, tone };
}

/** "12 h 15" plutôt que "12:15" — cette phrase est de la prose, pas un tableau. */
function formatHourFr(minutes: number): string {
  const norm = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const m = norm % 60;
  return `${h} h ${String(m).padStart(2, "0")}`;
}

/**
 * Phrase d'ouverture de l'accueil : « Poste d'après-midi · matinée libre
 * jusqu'à 12 h 15 ». Fonction PURE, testée — construit une phrase à partir de
 * créneaux RÉELLEMENT calculés (computeDayAvailability), jamais une
 * estimation : seule la mise en mots est une simplification assumée (un
 * créneau à cheval sur plusieurs demi-journées retombe sur la formulation
 * « de X à Y », la plus neutre).
 */
export function buildTodayPhrase(input: {
  isWorking: boolean;
  shiftLabel: string;
  windows: readonly FreeWindow[];
}): string {
  const prefix = input.isWorking ? `Poste ${lowerFirst(input.shiftLabel)}` : "Repos";
  const windowPhrase = describeMainWindow(input.windows);
  return windowPhrase ? `${prefix} · ${windowPhrase}` : `${prefix}.`;
}

function lowerFirst(s: string): string {
  return s.length > 0 ? s[0]!.toLowerCase() + s.slice(1) : s;
}

function timeOfDayLabel(minutes: number): "matinée" | "après-midi" | "soirée" {
  if (minutes < 12 * 60) return "matinée";
  if (minutes < 18 * 60) return "après-midi";
  return "soirée";
}

/** Décrit le plus long créneau libre du jour. `null` s'il n'y en a aucun. */
function describeMainWindow(windows: readonly FreeWindow[]): string | null {
  if (windows.length === 0) return null;
  const w = windows.reduce((a, b) => (b.durationMin > a.durationMin ? b : a));

  const coversFullDay = w.startMin <= 15 && w.endMin >= 1425;
  if (coversFullDay) return "libre toute la journée";

  const startsAtDayBegin = w.startMin <= 15;
  const endsAtDayEnd = w.endMin >= 1425;

  if (startsAtDayBegin) {
    return `${timeOfDayLabel(0)} libre jusqu'à ${formatHourFr(w.endMin)}`;
  }
  if (endsAtDayEnd) {
    return `${timeOfDayLabel(w.startMin)} libre à partir de ${formatHourFr(w.startMin)}`;
  }
  return `libre de ${formatHourFr(w.startMin)} à ${formatHourFr(w.endMin)}`;
}
