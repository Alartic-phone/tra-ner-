import { minutesToTime, timeToMinutes, type Day } from "./day.ts";
import type { ResolvedDay, ShiftTiming } from "./types.ts";

/**
 * Traduction du calendrier de postes en créneaux d'entraînement réellement
 * disponibles, et en contraintes physiologiques dures.
 *
 * Les valeurs par défaut ci-dessous sont celles du cahier des charges (§6.3),
 * mais TOUTES sont paramétrables depuis les réglages : ce module ne décide de
 * rien, il applique des règles qu'on lui donne.
 */

export type AvailabilityRules = {
  /** Temps tampon avant la prise de poste (préparation + trajet), en minutes. */
  bufferBeforeMin: number;
  /** Temps tampon après la sortie de poste, en minutes. */
  bufferAfterMin: number;
  /** Durée de sommeil réservée autour d'un poste, en minutes. */
  sleepBlockMin: number;
  /** Bornes de la journée utile un jour sans poste nocturne. */
  wakeTime: string;
  bedTime: string;
  /** Un créneau plus court que ceci n'est pas considéré comme exploitable. */
  minSessionMin: number;
  /** Durée maximale d'une séance un jour travaillé. */
  maxSessionOnWorkDayMin: number;
  /** Durée minimale pour qu'un créneau puisse accueillir une sortie longue. */
  longRunMinMin: number;
  /**
   * Délai à respecter après une sortie de poste de nuit avant toute séance de
   * qualité (VMA, seuil, côtes), en heures. Le manque de sommeil dégrade la
   * qualité de la séance et augmente le risque de blessure.
   */
  qualityBlockAfterNightH: number;
  /** Codes considérés comme des postes de nuit. */
  nightCodes: string[];
  /** Un poste commençant avant cette heure impose une nuit écourtée avant. */
  earlyShiftBeforeTime: string;
};

export const DEFAULT_AVAILABILITY_RULES: AvailabilityRules = {
  bufferBeforeMin: 60,
  bufferAfterMin: 60,
  sleepBlockMin: 420,
  wakeTime: "06:30",
  bedTime: "22:30",
  minSessionMin: 30,
  maxSessionOnWorkDayMin: 90,
  longRunMinMin: 75,
  qualityBlockAfterNightH: 12,
  nightCodes: ["N"],
  earlyShiftBeforeTime: "08:00",
};

export type Interval = { startMin: number; endMin: number };

export type FreeWindow = Interval & {
  durationMin: number;
  /**
   * Vrai si une part exploitable du créneau tombe hors du délai de
   * récupération suivant une sortie de nuit.
   */
  allowsQuality: boolean;
  /**
   * Minute à partir de laquelle une séance de qualité redevient permise dans
   * ce créneau. Égale à `startMin` en l'absence de contrainte, `null` si le
   * créneau est entièrement bloqué.
   */
  qualityStartMin: number | null;
};

export type DayAvailability = {
  day: Day;
  code: string | null;
  isWorking: boolean;
  /** Créneaux libres exploitables, triés chronologiquement. */
  windows: FreeWindow[];
  /** Durée de la plus longue séance possible ce jour-là, en minutes. */
  maxSessionMin: number;
  allowsQuality: boolean;
  allowsLongRun: boolean;
  /** Explications lisibles des interdictions, réutilisées dans l'UI et dans le
   *  contexte envoyé au modèle. */
  blockers: string[];
};

type ShiftOccurrence = {
  /** Décalage du jour porteur par rapport au jour analysé (-1, 0 ou +1). */
  dayOffset: number;
  code: string;
  isNight: boolean;
  /** Minutes relatives à minuit du jour analysé. Peut être négatif ou > 1440. */
  startMin: number;
  endMin: number;
};

function buildOccurrence(
  resolved: ResolvedDay | null,
  dayOffset: number,
  timings: ReadonlyMap<string, ShiftTiming>,
  rules: AvailabilityRules,
): ShiftOccurrence | null {
  if (!resolved || resolved.code === null) return null;
  const timing = timings.get(resolved.code);
  if (!timing || !timing.isWork) return null;

  const start = timeToMinutes(timing.startTime);
  let end = timeToMinutes(timing.endTime);
  // Un poste dont l'heure de fin précède l'heure de début passe minuit.
  if (end <= start) end += 1440;

  return {
    dayOffset,
    code: resolved.code,
    isNight: rules.nightCodes.includes(resolved.code),
    startMin: start + dayOffset * 1440,
    endMin: end + dayOffset * 1440,
  };
}

function subtract(free: Interval[], busy: Interval): Interval[] {
  const out: Interval[] = [];
  for (const f of free) {
    if (busy.endMin <= f.startMin || busy.startMin >= f.endMin) {
      out.push(f);
      continue;
    }
    if (busy.startMin > f.startMin) {
      out.push({ startMin: f.startMin, endMin: busy.startMin });
    }
    if (busy.endMin < f.endMin) {
      out.push({ startMin: busy.endMin, endMin: f.endMin });
    }
  }
  return out;
}

/**
 * Calcule les créneaux disponibles d'une journée.
 *
 * Les journées adjacentes sont nécessaires : un poste de nuit de la veille
 * occupe le début de la journée analysée, et un poste de nuit du lendemain
 * interdit la sortie longue du jour (veille d'entrée en nuit).
 */
export function computeDayAvailability(
  today: ResolvedDay,
  previousDay: ResolvedDay | null,
  nextDay: ResolvedDay | null,
  timings: ReadonlyMap<string, ShiftTiming>,
  rules: AvailabilityRules = DEFAULT_AVAILABILITY_RULES,
): DayAvailability {
  const occurrences = [
    buildOccurrence(previousDay, -1, timings, rules),
    buildOccurrence(today, 0, timings, rules),
    buildOccurrence(nextDay, 1, timings, rules),
  ].filter((o): o is ShiftOccurrence => o !== null);

  const blockers: string[] = [];

  let free: Interval[] = [{ startMin: 0, endMin: 1440 }];

  // Repos nocturne standard, appliqué borne par borne. Une borne recouverte
  // par un poste est ignorée : quand on travaille de nuit, le sommeil n'a pas
  // lieu la nuit, il est reconstitué de jour et modélisé plus bas par le bloc
  // de sommeil rattaché au poste.
  const overlaps = (a: Interval, b: Interval) =>
    a.startMin < b.endMin && b.startMin < a.endMin;
  const defaultRests: Interval[] = [
    { startMin: 0, endMin: timeToMinutes(rules.wakeTime) },
    { startMin: timeToMinutes(rules.bedTime), endMin: 1440 },
  ];
  for (const rest of defaultRests) {
    const covered = occurrences.some((o) =>
      overlaps(rest, {
        startMin: o.startMin - rules.bufferBeforeMin,
        endMin: o.endMin + rules.bufferAfterMin,
      }),
    );
    if (!covered) free = subtract(free, rest);
  }

  const earlyThreshold = timeToMinutes(rules.earlyShiftBeforeTime);

  for (const occ of occurrences) {
    // Poste + tampons.
    free = subtract(free, {
      startMin: occ.startMin - rules.bufferBeforeMin,
      endMin: occ.endMin + rules.bufferAfterMin,
    });

    // Sommeil rattaché : après le poste pour une nuit, avant pour un poste
    // matinal (lever anticipé).
    if (occ.isNight) {
      const sleepStart = occ.endMin + rules.bufferAfterMin;
      free = subtract(free, {
        startMin: sleepStart,
        endMin: sleepStart + rules.sleepBlockMin,
      });
    } else if (occ.startMin - occ.dayOffset * 1440 < earlyThreshold) {
      const sleepEnd = occ.startMin - rules.bufferBeforeMin;
      free = subtract(free, {
        startMin: sleepEnd - rules.sleepBlockMin,
        endMin: sleepEnd,
      });
    }
  }

  // Fin du dernier poste de nuit qui impacte la journée : borne du délai de
  // récupération avant toute séance de qualité.
  const nightEnds = occurrences
    .filter((o) => o.isNight)
    .map((o) => o.endMin)
    .filter((end) => end <= 1440);
  const lastNightEnd = nightEnds.length > 0 ? Math.max(...nightEnds) : null;
  const qualityFreeFrom =
    lastNightEnd === null ? null : lastNightEnd + rules.qualityBlockAfterNightH * 60;

  const windows: FreeWindow[] = free
    .map((w) => ({
      startMin: Math.max(0, w.startMin),
      endMin: Math.min(1440, w.endMin),
    }))
    .filter((w) => w.endMin - w.startMin >= rules.minSessionMin)
    .map((w) => {
      // Un créneau qui commence trop tôt après une nuit n'est pas perdu :
      // seule sa première partie l'est. On conserve donc l'heure à partir de
      // laquelle une séance de qualité redevient possible.
      const from = qualityFreeFrom === null ? w.startMin : Math.max(w.startMin, qualityFreeFrom);
      const qualityOk = w.endMin - from >= rules.minSessionMin;
      return {
        ...w,
        durationMin: w.endMin - w.startMin,
        allowsQuality: qualityOk,
        qualityStartMin: qualityOk ? from : null,
      };
    })
    .sort((a, b) => a.startMin - b.startMin);

  const longestWindow = windows.reduce((max, w) => Math.max(max, w.durationMin), 0);
  const maxSessionMin = today.isWorking
    ? Math.min(longestWindow, rules.maxSessionOnWorkDayMin)
    : longestWindow;

  if (windows.length === 0) {
    blockers.push(
      today.isWorking
        ? `Poste ${today.code} : aucun créneau d'au moins ${rules.minSessionMin} min.`
        : `Aucun créneau d'au moins ${rules.minSessionMin} min.`,
    );
  }

  const allowsQuality = windows.some((w) => w.allowsQuality) && maxSessionMin > 0;
  if (!allowsQuality && lastNightEnd !== null && windows.length > 0) {
    blockers.push(
      `Séance de qualité interdite : moins de ${rules.qualityBlockAfterNightH} h ` +
        `après la sortie de nuit (fin à ${minutesToTime(lastNightEnd)}).`,
    );
  }

  const todayIsNight = today.code !== null && rules.nightCodes.includes(today.code);
  const nextIsNight =
    nextDay?.code != null && rules.nightCodes.includes(nextDay.code);

  let allowsLongRun = maxSessionMin >= rules.longRunMinMin;
  if (todayIsNight) {
    allowsLongRun = false;
    blockers.push("Sortie longue interdite : jour de poste de nuit.");
  } else if (nextIsNight) {
    allowsLongRun = false;
    blockers.push("Sortie longue interdite : veille d'une entrée en nuit.");
  } else if (!allowsLongRun && windows.length > 0) {
    blockers.push(
      `Créneau trop court pour une sortie longue (${maxSessionMin} min ` +
        `disponibles, ${rules.longRunMinMin} min requises).`,
    );
  }

  return {
    day: today.day,
    code: today.code,
    isWorking: today.isWorking,
    windows,
    maxSessionMin,
    allowsQuality,
    allowsLongRun,
    blockers,
  };
}

/** Calcule la disponibilité sur une plage, en chaînant les jours adjacents. */
export function computeAvailability(
  resolvedDays: readonly ResolvedDay[],
  timings: ReadonlyMap<string, ShiftTiming>,
  rules: AvailabilityRules = DEFAULT_AVAILABILITY_RULES,
): DayAvailability[] {
  return resolvedDays.map((day, i) =>
    computeDayAvailability(
      day,
      resolvedDays[i - 1] ?? null,
      resolvedDays[i + 1] ?? null,
      timings,
      rules,
    ),
  );
}

export function timingsToMap(
  timings: readonly ShiftTiming[],
): ReadonlyMap<string, ShiftTiming> {
  return new Map(timings.map((t) => [t.code, t]));
}
