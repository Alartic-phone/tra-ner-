/**
 * Fraîcheur du jour — bannière du tableau de bord.
 *
 * Modèle « HRV vs plage habituelle », popularisé par Whoop/Oura : la valeur
 * absolue du VFC (HRV) importe peu (elle varie énormément d'une personne à
 * l'autre), c'est l'écart au niveau habituel de CETTE personne qui est
 * informatif. On calcule donc une moyenne et un écart-type glissants sur les
 * jours précédents, puis on situe le jour courant dedans.
 *
 * Volontairement pas de nom de statut médical : aucun conseil de santé
 * prescriptif (charte du projet), juste un signal d'entraînement. Rouge
 * n'est jamais une consigne d'arrêt, seulement une invitation à la prudence.
 */

export type ReadinessStatus = "frais" | "correct" | "prudence";

export type ReadinessInput = {
  hrv: number;
  restingHr: number;
  hrvBaselineMean: number;
  hrvBaselineSd: number;
  restingHrBaselineMean: number;
};

export type ReadinessResult = {
  status: ReadinessStatus;
  hrvDeltaPct: number;
  restingHrDeltaBpm: number;
};

/**
 * `baselineSamples` doit exclure le jour courant : sans ça, la moyenne
 * inclurait la valeur qu'on compare, et amortirait tout écart.
 */
export function computeReadiness(input: ReadinessInput): ReadinessResult {
  const { hrv, restingHr, hrvBaselineMean, hrvBaselineSd, restingHrBaselineMean } = input;

  const hrvDeltaPct =
    hrvBaselineMean > 0 ? ((hrv - hrvBaselineMean) / hrvBaselineMean) * 100 : 0;
  const restingHrDeltaBpm = restingHr - restingHrBaselineMean;

  const sd = hrvBaselineSd > 0 ? hrvBaselineSd : hrvBaselineMean * 0.1;
  const z = sd > 0 ? (hrv - hrvBaselineMean) / sd : 0;

  let status: ReadinessStatus;
  if (z <= -1 || restingHrDeltaBpm >= 5) {
    status = "prudence";
  } else if (z < -0.5 || restingHrDeltaBpm >= 3) {
    status = "correct";
  } else {
    status = "frais";
  }

  return { status, hrvDeltaPct, restingHrDeltaBpm };
}

/**
 * Règle d'arrêt de l'accueil : distincte du statut à 3 niveaux ci-dessus, qui
 * ne prescrit jamais de consigne. Ici, l'accueil DOIT remplacer la séance par
 * « marche ou vélo en promenade » — VFC sous la borne basse (même seuil z ≤
 * -1 que le statut "prudence") OU FC de repos au-delà d'un seuil ABSOLU de
 * 65 bpm (indépendant de la ligne de base personnelle, contrairement au
 * statut ci-dessus).
 */
export function shouldCancelSession(input: ReadinessInput): boolean {
  const sd = input.hrvBaselineSd > 0 ? input.hrvBaselineSd : input.hrvBaselineMean * 0.1;
  const z = sd > 0 ? (input.hrv - input.hrvBaselineMean) / sd : 0;
  return z <= -1 || input.restingHr > 65;
}

/** Moyenne et écart-type (population) d'une série non vide. */
export function meanAndStdDev(values: readonly number[]): { mean: number; sd: number } {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, sd: Math.sqrt(variance) };
}

export type HealthSample = { day: string; hrv: number | null; restingHr: number | null };

export type ReadinessMeasurement = {
  measurementDay: string;
  hrv: number;
  restingHr: number;
  hrvBaseline: { mean: number; sd: number };
  restingHrBaseline: { mean: number; sd: number };
};

/**
 * Trouve la mesure la plus récente COMPLÈTE (VFC et FC de repos toutes deux
 * présentes) dans `history`, triée du jour le plus récent au plus ancien —
 * ce n'est pas forcément le jour courant : avant le réveil, ou en sortie de
 * poste, la mesure du jour n'existe simplement pas encore, et ce n'est pas
 * une raison de perdre la dernière connue.
 *
 * La plage habituelle se calcule sur les `baselineSamples` jours DISPONIBLES
 * précédant cette mesure (pas les jours calendaires) : le capteur ayant des
 * trous (ex. VFC absente avant une date donnée), ancrer la fenêtre sur le
 * calendrier sous-échantillonnerait ou raterait carrément la baseline.
 */
export function findLatestReadinessMeasurement(
  history: readonly HealthSample[],
  baselineSamples = 7,
): ReadinessMeasurement | null {
  const measurement = history.find((h) => h.hrv != null && h.restingHr != null);
  if (!measurement) return null;

  const before = history.filter((h) => h.day < measurement.day);
  const hrvSamples = before
    .map((h) => h.hrv)
    .filter((v): v is number => v != null)
    .slice(0, baselineSamples);
  const restingHrSamples = before
    .map((h) => h.restingHr)
    .filter((v): v is number => v != null)
    .slice(0, baselineSamples);
  if (hrvSamples.length < baselineSamples || restingHrSamples.length < baselineSamples) return null;

  return {
    measurementDay: measurement.day,
    hrv: measurement.hrv!,
    restingHr: measurement.restingHr!,
    hrvBaseline: meanAndStdDev(hrvSamples),
    restingHrBaseline: meanAndStdDev(restingHrSamples),
  };
}
