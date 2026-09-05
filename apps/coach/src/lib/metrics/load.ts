import { addDays, diffDays, eachDay, type Day } from "../shifts/day.ts";

/**
 * Modèle de charge, de fatigue et de forme.
 *
 * Toutes les séries sont indexées par jour calendaire, y compris les jours
 * sans entraînement : un jour de repos vaut une charge de zéro, et cette
 * valeur compte — c'est elle qui fait décroître la fatigue et qui abaisse la
 * monotonie de Foster. Les omettre fausserait tous les indicateurs.
 */

export type DailyLoad = { day: Day; load: number };

/** Constantes de temps usuelles, en jours. Paramétrables. */
export const CTL_TAU = 42;
export const ATL_TAU = 7;

export type FitnessPoint = {
  day: Day;
  load: number;
  /** Condition physique — moyenne mobile exponentielle à 42 jours. */
  ctl: number;
  /** Fatigue — moyenne mobile exponentielle à 7 jours. */
  atl: number;
  /**
   * Forme : CTL − ATL, calculée sur les valeurs BRUTES de `ctl` et `atl`
   * ci-dessus, jamais sur leurs valeurs arrondies pour l'affichage.
   *
   * Conséquence assumée : `Math.round(tsb)` peut différer de
   * `Math.round(ctl) - Math.round(atl)` d'une unité (ex. condition physique
   * affichée à 1, fatigue à 9, forme à −7 et non −8) — c'est l'arrondi
   * indépendant de trois valeurs affichées côte à côte qui ne « tombe juste »
   * que par coïncidence, pas une erreur de calcul. Arrondir `ctl` et `atl`
   * AVANT de les soustraire pour que l'affichage boucle serait le vrai bug :
   * ça ferait dépendre la forme de l'arrondi d'affichage plutôt que de la
   * charge réelle.
   */
  tsb: number;
  /**
   * Faux tant que l'historique accumulé est plus court que la constante de
   * temps la plus longue : la CTL part de zéro et met six semaines à devenir
   * représentative. L'interface doit le signaler plutôt que d'afficher une
   * valeur d'apparence crédible.
   */
  reliable: boolean;
};

/**
 * Série CTL / ATL / TSB.
 *
 * Récurrence exponentielle classique (convention TrainingPeaks) :
 *
 *   CTL_j = CTL_{j-1} + (charge_j − CTL_{j-1}) / τ
 *
 * Elle équivaut à une moyenne mobile pondérée dont l'influence d'une séance
 * décroît d'autant plus vite que τ est petit. La fatigue (τ = 7) monte et
 * retombe vite, la condition physique (τ = 42) s'accumule lentement.
 */
export function computeFitnessSeries(
  loads: readonly DailyLoad[],
  options: { ctlTau?: number; atlTau?: number; initialCtl?: number; initialAtl?: number } = {},
): FitnessPoint[] {
  if (loads.length === 0) return [];

  const ctlTau = options.ctlTau ?? CTL_TAU;
  const atlTau = options.atlTau ?? ATL_TAU;

  const sorted = [...loads].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  const first = sorted[0]!.day;
  const last = sorted[sorted.length - 1]!.day;
  const byDay = new Map(sorted.map((l) => [l.day, l.load]));

  let ctl = options.initialCtl ?? 0;
  let atl = options.initialAtl ?? 0;
  const out: FitnessPoint[] = [];

  for (const day of eachDay(first, last)) {
    const load = byDay.get(day) ?? 0;
    ctl += (load - ctl) / ctlTau;
    atl += (load - atl) / atlTau;
    out.push({
      day,
      load,
      ctl,
      atl,
      tsb: ctl - atl,
      reliable: diffDays(first, day) >= ctlTau,
    });
  }

  return out;
}

export type AcwrZone = "sous-charge" | "optimale" | "prudence" | "alerte" | "indeterminee";

/** Historique disponible insuffisant pour que le ratio ait un sens. */
export type InsufficientHistory = {
  /** Jours écoulés depuis la première activité connue, jusqu'au jour calculé. */
  daysAvailable: number;
  /** Jours de calendrier requis. */
  daysRequired: number;
  /** Jours avec une charge réelle (> 0) dans la fenêtre, si ce critère s'applique. */
  activeDays: number | null;
  /** Jours actifs requis, si ce critère s'applique. */
  activeDaysRequired: number | null;
};

export type Acwr = {
  day: Day;
  /** Charge moyenne quotidienne des 7 derniers jours. */
  acute: number;
  /** Charge moyenne quotidienne des 28 derniers jours. */
  chronic: number;
  /**
   * `null` quand la charge chronique est nulle, ou quand l'historique est
   * trop court pour qu'un ratio veuille dire quelque chose (`insufficientHistory`
   * porte alors la raison). Aucune recommandation d'entraînement ne sort d'un
   * calcul dont l'historique est insuffisant : c'est à `zone` de retomber sur
   * "indeterminee" plutôt que de laisser un garde-fou se déclencher sur un
   * ratio construit à partir d'une poignée de jours.
   */
  ratio: number | null;
  zone: AcwrZone;
  insufficientHistory: InsufficientHistory | null;
};

/** Jours d'activité réelle minimum dans la fenêtre chronique pour qu'un ratio soit publié. */
const ACWR_MIN_ACTIVE_DAYS = 8;

/**
 * Ratio aigu/chronique (7 jours / 28 jours), en moyennes quotidiennes.
 *
 * Source : Gabbett T.J. (2016), « The training-injury prevention paradox »,
 * British Journal of Sports Medicine, 50(5), 273-280.
 *
 * Le ratio compare ce qu'on vient de faire à ce à quoi l'organisme est
 * habitué. La zone 0,8-1,3 est celle où le risque de blessure est le plus
 * faible ; au-delà de 1,5 la progression de charge est trop brutale.
 *
 * Ce sont bien des MOYENNES quotidiennes qui sont comparées, pas des sommes :
 * comparer une somme sur 7 jours à une somme sur 28 donnerait mécaniquement
 * un ratio autour de 0,25.
 *
 * `options.historyStartDay`, quand il est fourni (y compris `null` pour
 * « aucune activité connue »), active un garde-fou : le ratio n'est calculé
 * que si la fenêtre chronique couvre au moins `chronicDays` jours DEPUIS LA
 * PREMIÈRE ACTIVITÉ CONNUE, dont au moins `ACWR_MIN_ACTIVE_DAYS` avec une
 * charge réelle. En dessous, `ratio` est `null` — jamais un chiffre calculé
 * sur une poignée de jours zéro-remplis par `toDailyLoads` avant même que le
 * suivi n'existe. Omettre l'option désactive le garde-fou (utile pour tester
 * la mécanique du ratio isolément, sans avoir à fournir une date d'historique
 * à chaque appel).
 */
export function computeAcwr(
  loads: readonly DailyLoad[],
  day: Day,
  options: {
    acuteDays?: number;
    chronicDays?: number;
    historyStartDay?: Day | null;
  } = {},
): Acwr {
  const acuteDays = options.acuteDays ?? 7;
  const chronicDays = options.chronicDays ?? 28;
  const byDay = new Map(loads.map((l) => [l.day, l.load]));

  const meanOver = (days: number): number => {
    let sum = 0;
    for (let i = 0; i < days; i++) sum += byDay.get(addDays(day, -i)) ?? 0;
    return sum / days;
  };

  const acute = meanOver(acuteDays);
  const chronic = meanOver(chronicDays);

  let insufficientHistory: InsufficientHistory | null = null;
  if (options.historyStartDay !== undefined) {
    const daysAvailable =
      options.historyStartDay != null ? diffDays(options.historyStartDay, day) + 1 : 0;
    let activeDays = 0;
    for (let i = 0; i < chronicDays; i++) {
      if ((byDay.get(addDays(day, -i)) ?? 0) > 0) activeDays++;
    }
    if (daysAvailable < chronicDays || activeDays < ACWR_MIN_ACTIVE_DAYS) {
      insufficientHistory = {
        daysAvailable: Math.max(0, daysAvailable),
        daysRequired: chronicDays,
        activeDays,
        activeDaysRequired: ACWR_MIN_ACTIVE_DAYS,
      };
    }
  }

  const ratio = insufficientHistory == null && chronic > 0 ? acute / chronic : null;

  return { day, acute, chronic, ratio, zone: acwrZone(ratio), insufficientHistory };
}

export function acwrZone(ratio: number | null): AcwrZone {
  if (ratio === null) return "indeterminee";
  if (ratio < 0.8) return "sous-charge";
  if (ratio <= 1.3) return "optimale";
  if (ratio <= 1.5) return "prudence";
  return "alerte";
}

/**
 * Aucune recommandation d'entraînement ne sort d'un calcul dont l'historique
 * est insuffisant : cette fonction met en mots la raison plutôt que de
 * laisser le chiffre s'afficher quand même. Partagée par /analyses et la
 * carte Charge de l'accueil — même garde-fou, même formulation.
 */
export function insufficientHistoryReason(info: InsufficientHistory): string {
  if (info.activeDaysRequired != null && info.activeDays != null && info.activeDays < info.activeDaysRequired) {
    return (
      `historique insuffisant : ${info.activeDays} jour${info.activeDays > 1 ? "s" : ""} actif` +
      `${info.activeDays > 1 ? "s" : ""} sur ${info.activeDaysRequired} requis dans les ` +
      `${info.daysRequired} derniers jours`
    );
  }
  return `historique insuffisant : ${info.daysAvailable} jour${info.daysAvailable > 1 ? "s" : ""} sur ${info.daysRequired}`;
}

export type FosterMetrics = {
  /** Somme des charges quotidiennes de la fenêtre — un simple total, jamais gardé. */
  weeklyLoad: number;
  /**
   * Monotonie : moyenne des charges quotidiennes divisée par leur écart-type.
   * `null` si l'écart-type est nul (toutes les journées identiques) OU si
   * l'historique est trop court (`insufficientHistory`).
   */
  monotony: number | null;
  /** Contrainte : charge de la fenêtre × monotonie. Même garde que `monotony`. */
  strain: number | null;
  /** Vrai au-delà du seuil de 2,0 au-delà duquel Foster observe un surrisque. */
  monotonyWarning: boolean;
  insufficientHistory: InsufficientHistory | null;
};

/**
 * Monotonie et contrainte de Foster.
 *
 * Source : Foster C. (1998), « Monitoring training in athletes with reference
 * to overtraining syndrome », Medicine & Science in Sports & Exercise, 30(7),
 * 1164-1168.
 *
 *   monotonie = moyenne des charges QUOTIDIENNES / écart-type de ces charges
 *   contrainte = charge hebdomadaire totale × monotonie
 *
 * L'intuition : s'entraîner tous les jours à la même dose est plus délétère
 * que la même charge répartie de façon contrastée avec de vraies journées de
 * repos. C'est un indicateur particulièrement pertinent chez quelqu'un dont
 * le sommeil est déjà perturbé par le travail posté.
 *
 * L'écart-type est celui de la population (division par n), conformément à
 * l'usage de Foster sur une fenêtre fermée de sept jours.
 *
 * `options.historyStartDay` (cf. `computeAcwr`) active le même garde-fou :
 * en dessous de `windowDays` jours d'historique réel, une seule vraie séance
 * entourée de jours zéro-remplis avant le début du suivi produirait une
 * monotonie et une contrainte plausibles mais sans aucun sens statistique.
 * Aucune recommandation d'entraînement ne sort d'un calcul dont l'historique
 * est insuffisant : `monotony` et `strain` restent `null` plutôt que
 * d'afficher un chiffre construit sur une poignée de jours.
 */
export function computeFoster(
  loads: readonly DailyLoad[],
  day: Day,
  windowDays = 7,
  options: { historyStartDay?: Day | null } = {},
): FosterMetrics {
  const byDay = new Map(loads.map((l) => [l.day, l.load]));
  const values: number[] = [];
  for (let i = 0; i < windowDays; i++) values.push(byDay.get(addDays(day, -i)) ?? 0);

  const weeklyLoad = values.reduce((a, b) => a + b, 0);

  let insufficientHistory: InsufficientHistory | null = null;
  if (options.historyStartDay !== undefined) {
    const daysAvailable =
      options.historyStartDay != null ? diffDays(options.historyStartDay, day) + 1 : 0;
    if (daysAvailable < windowDays) {
      insufficientHistory = {
        daysAvailable: Math.max(0, daysAvailable),
        daysRequired: windowDays,
        activeDays: null,
        activeDaysRequired: null,
      };
    }
  }
  if (insufficientHistory) {
    return { weeklyLoad, monotony: null, strain: null, monotonyWarning: false, insufficientHistory };
  }

  const mean = weeklyLoad / windowDays;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / windowDays;
  const sd = Math.sqrt(variance);

  if (sd === 0) {
    return {
      weeklyLoad,
      monotony: null,
      strain: null,
      monotonyWarning: false,
      insufficientHistory: null,
    };
  }

  const monotony = mean / sd;
  return {
    weeklyLoad,
    monotony,
    strain: weeklyLoad * monotony,
    monotonyWarning: monotony > 2,
    insufficientHistory: null,
  };
}

/**
 * Décalage vertical (en pixels) des deux étiquettes de fin de série (CTL et
 * ATL) sur le graphique « Charge, condition physique et fatigue », pour
 * éviter qu'elles se superposent quand les deux courbes finissent proches
 * l'une de l'autre. Seuil relatif à l'amplitude de la série affichée
 * (`valueRange`), pas un seuil absolu qui serait faux à une autre échelle de
 * charge.
 */
export function computeEndLabelOffsets(
  ctl: number,
  atl: number,
  valueRange: number,
): { ctlDy: number; atlDy: number } {
  const range = valueRange || 1;
  const close = Math.abs(ctl - atl) / range < 0.08;
  if (!close) return { ctlDy: 0, atlDy: 0 };
  return ctl >= atl ? { ctlDy: -7, atlDy: 7 } : { ctlDy: 7, atlDy: -7 };
}

/** Agrège des charges d'activité en charges quotidiennes, jours vides compris. */
export function toDailyLoads(
  activities: ReadonlyArray<{ day: Day; load: number | null }>,
  from: Day,
  to: Day,
): DailyLoad[] {
  const totals = new Map<Day, number>();
  for (const a of activities) {
    if (a.load == null) continue;
    totals.set(a.day, (totals.get(a.day) ?? 0) + a.load);
  }
  return eachDay(from, to).map((day) => ({ day, load: totals.get(day) ?? 0 }));
}
