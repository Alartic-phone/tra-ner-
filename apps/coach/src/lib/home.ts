import type { FreeWindow } from "./shifts/availability.ts";
import { mondayOf, addDays, diffDays, type Day } from "./shifts/day.ts";

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

// ---------------------------------------------------------------------------
// Charge hebdomadaire (section 3.3 de l'accueil)
// ---------------------------------------------------------------------------

/**
 * Pas d'axe "rond" immédiatement supérieur ou égal à `raw` (1, 2, 2,5, 5, 10
 * × une puissance de dix) — jamais un pas arbitraire du type 0,95/1,9/2,85
 * qui rendrait les graduations illisibles (règle explicite de la refonte).
 */
export function niceAxisStep(raw: number): number {
  if (raw <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const fraction = raw / magnitude;
  const step = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return step * magnitude;
}

/** Graduations rondes de 0 à au moins `maxValue`, en `targetTicks` paliers environ. */
export function buildAxisTicks(maxValue: number, targetTicks = 4): number[] {
  if (maxValue <= 0) return [0];
  const step = niceAxisStep(maxValue / targetTicks);
  const count = Math.ceil(maxValue / step);
  return Array.from({ length: count + 1 }, (_, i) => Math.round(i * step * 100) / 100);
}

export type WeekLoadState = "done" | "current" | "planned" | "planned-deload";

export type WeekLoadInput = {
  weekStart: Day;
  /** Distance réellement courue cette semaine-là (km), depuis lib/metrics/volume.ts. */
  realizedKm: number;
  /** Cible prévue par le plan pour cette semaine (km), `null` sans plan. */
  plannedKm: number | null;
};

export type WeekLoadBar = WeekLoadInput & { index: number; state: WeekLoadState };

/**
 * Construit la série de barres S1..Sn à partir de semaines déjà chargées.
 * L'état ("réalisé" / "en cours" / "prévu" / "allégée") se déduit de la
 * position de la semaine par rapport à AUJOURD'HUI et, pour le futur, d'une
 * cible prévue significativement plus basse que celle de la semaine
 * précédente — jamais un indicateur "allégée" stocké et inventé : sans plan,
 * aucune semaine future ne peut être autre chose que "prévu" ou rester
 * absente.
 */
export function buildWeeklyLoadBars(weeks: readonly WeekLoadInput[], today: Day): WeekLoadBar[] {
  const currentWeekStart = mondayOf(today);
  return weeks.map((w, i) => {
    let state: WeekLoadState;
    if (w.weekStart === currentWeekStart) {
      state = "current";
    } else if (w.weekStart < currentWeekStart) {
      state = "done";
    } else {
      const previous = weeks[i - 1];
      const isDeload =
        w.plannedKm != null && previous?.plannedKm != null && w.plannedKm < previous.plannedKm * 0.85;
      state = isDeload ? "planned-deload" : "planned";
    }
    return { ...w, index: i + 1, state };
  });
}

// ---------------------------------------------------------------------------
// Points de vigilance (section 3.7 de l'accueil)
// ---------------------------------------------------------------------------

export type VigilanceLevel = "bloquant" | "a-surveiller" | "stable";

export type VigilanceEntry = {
  level: VigilanceLevel;
  title: string;
  /** Phrase qui dit QUOI FAIRE — jamais un simple constat. */
  action: string;
};

export type VigilanceInput = {
  today: Day;
  /** `null` si jamais pesé — pas la même chose que "il y a longtemps". */
  daysSinceLastWeighing: number | null;
  /** `null` si aucune séance de renfo n'existe dans l'historique. */
  daysSinceLastStrength: number | null;
  /** Jours restants avant la fin de la semaine calendaire (0 = dimanche). */
  daysLeftInWeek: number;
  weekRealizedKm: number;
  /** `null` sans cible connue (ni plan actif, ni volume de profil). */
  weekTargetKm: number | null;
  /** Fraction (0-1) du temps de la semaine hors zones 1-2, `null` sans mesure. */
  weekOutOfZone12Fraction: number | null;
  /** Activités récentes portant une mesure hors bornes plausibles. */
  suspiciousActivities: ReadonlyArray<{ id: string; day: Day; reason: string }>;
};

const WEIGHING_STALE_DAYS = 14;
const STRENGTH_STALE_DAYS = 10;
const VOLUME_SHORTFALL_RATIO = 0.7;
const VOLUME_SHORTFALL_DAYS_LEFT = 2;
const INTENSITY_OUT_OF_ZONE_THRESHOLD = 0.25;

/**
 * Pense-bête, pas système d'alerte automatique : chaque entrée vient d'une
 * règle explicite et déterministe (jamais un jugement de modèle de langage).
 * Aucune entrée sur la natation ni le triathlon — l'objectif en cours est la
 * course à pied, un rappel hors objectif serait du bruit (règle explicite de
 * la refonte).
 */
export function detectVigilancePoints(input: VigilanceInput): VigilanceEntry[] {
  const entries: VigilanceEntry[] = [];

  if (input.daysSinceLastWeighing == null) {
    entries.push({
      level: "a-surveiller",
      title: "Pesée",
      action: "Aucune pesée enregistrée pour l'instant — renseigner un poids dans le journal.",
    });
  } else if (input.daysSinceLastWeighing > WEIGHING_STALE_DAYS) {
    entries.push({
      level: "a-surveiller",
      title: "Pesée",
      action: `Dernière pesée il y a ${input.daysSinceLastWeighing} jours — à refaire.`,
    });
  }

  if (input.daysSinceLastStrength == null || input.daysSinceLastStrength > STRENGTH_STALE_DAYS) {
    entries.push({
      level: "a-surveiller",
      title: "Renforcement",
      action:
        input.daysSinceLastStrength == null
          ? "Aucune séance de renforcement dans l'historique — en prévoir une."
          : `Dernière séance de renforcement il y a ${input.daysSinceLastStrength} jours — en reprogrammer une.`,
    });
  }

  if (
    input.weekTargetKm != null &&
    input.weekTargetKm > 0 &&
    input.daysLeftInWeek < VOLUME_SHORTFALL_DAYS_LEFT &&
    input.weekRealizedKm / input.weekTargetKm < VOLUME_SHORTFALL_RATIO
  ) {
    const pct = Math.round((input.weekRealizedKm / input.weekTargetKm) * 100);
    entries.push({
      level: "bloquant",
      title: "Volume de la semaine",
      action: `${pct} % de la cible avec moins de deux jours restants — ajuster la semaine plutôt que de forcer un rattrapage.`,
    });
  }

  if (input.weekOutOfZone12Fraction != null && input.weekOutOfZone12Fraction > INTENSITY_OUT_OF_ZONE_THRESHOLD) {
    const pct = Math.round(input.weekOutOfZone12Fraction * 100);
    entries.push({
      level: "a-surveiller",
      title: "Intensité de la semaine",
      action: `${pct} % du temps hors zone 1-2 — resserrer les prochaines sorties faciles sous la FC seuil.`,
    });
  }

  for (const a of input.suspiciousActivities) {
    entries.push({
      level: "a-surveiller",
      title: "Valeur à confirmer",
      action: `Activité du ${a.day} : ${a.reason} — vérifier la donnée source avant de s'y fier.`,
    });
  }

  return entries;
}

export function daysLeftInWeek(today: Day): number {
  return diffDays(today, addDays(mondayOf(today), 6));
}
