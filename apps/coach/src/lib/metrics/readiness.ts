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

/** Moyenne et écart-type (population) d'une série non vide. */
export function meanAndStdDev(values: readonly number[]): { mean: number; sd: number } {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return { mean, sd: Math.sqrt(variance) };
}
