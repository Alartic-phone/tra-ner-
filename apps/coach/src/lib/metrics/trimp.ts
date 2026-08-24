/**
 * Charge d'entraînement — TRIMP de Banister.
 *
 * Source : Banister E.W. (1991), « Modeling elite athletic performance », in
 * Physiological Testing of Elite Athletes, Human Kinetics, p. 403-424.
 *
 *   TRIMP = D × ΔHR × Y
 *
 * où D est la durée en minutes, ΔHR la fraction de réserve cardiaque
 * (Karvonen) et Y un facteur de pondération exponentiel qui traduit le fait
 * qu'une minute à haute intensité coûte bien plus qu'une minute en endurance :
 *
 *   Y = 0,64 × e^(1,92 × ΔHR)   chez l'homme
 *   Y = 0,86 × e^(1,67 × ΔHR)   chez la femme
 *
 * Les deux coefficients diffèrent, pas seulement l'exposant : ils sont issus
 * de la relation lactate/fréquence cardiaque mesurée séparément sur chaque
 * population.
 */

export type Sex = "M" | "F";

export type HeartRateProfile = {
  hrMax: number;
  hrRest: number;
  sex: Sex;
};

/** Coefficients de pondération de Banister, par sexe. */
const BANISTER = {
  M: { factor: 0.64, exponent: 1.92 },
  F: { factor: 0.86, exponent: 1.67 },
} as const;

/**
 * Fraction de réserve cardiaque (Karvonen) :
 *
 *   ΔHR = (FC − FC_repos) / (FC_max − FC_repos)
 *
 * Bornée à [0, 1]. Une FC au-dessus du maximum déclaré arrive (maximum
 * sous-estimé, artefact de capteur) ; sans borne, le terme exponentiel
 * s'emballerait et une seule seconde aberrante fausserait toute la séance.
 */
export function heartRateReserveFraction(hr: number, profile: HeartRateProfile): number {
  const reserve = profile.hrMax - profile.hrRest;
  if (reserve <= 0) return 0;
  return Math.min(1, Math.max(0, (hr - profile.hrRest) / reserve));
}

/** Facteur de pondération Y de Banister pour une fraction de réserve donnée. */
export function banisterWeight(fraction: number, sex: Sex): number {
  const { factor, exponent } = BANISTER[sex];
  return factor * Math.exp(exponent * fraction);
}

/**
 * TRIMP calculé seconde par seconde à partir du flux de fréquence cardiaque.
 *
 * C'est la forme la plus fidèle : elle tient compte de la distribution réelle
 * de l'intensité, là où une moyenne écrase un fractionné et une sortie
 * régulière sur la même valeur.
 *
 * Les échantillons sans mesure (`null`) sont ignorés, jamais interpolés — leur
 * durée est simplement exclue du total, ce que `coveredSeconds` rapporte.
 */
export function trimpFromStream(
  heartrate: ReadonlyArray<number | null>,
  time: ReadonlyArray<number>,
  profile: HeartRateProfile,
): { trimp: number; coveredSeconds: number } | null {
  if (heartrate.length === 0 || time.length === 0) return null;

  let trimp = 0;
  let covered = 0;
  const n = Math.min(heartrate.length, time.length);

  // Chaque échantillon se voit attribuer l'intervalle qui le PRÉCÈDE. Le
  // premier point est donc exclu : n échantillons ne délimitent que n−1
  // intervalles, et lui attribuer une durée supplémentaire surestimerait la
  // séance d'un pas d'échantillonnage.
  for (let i = 1; i < n; i++) {
    const hr = heartrate[i];
    if (hr == null) continue;

    const current = time[i];
    const previous = time[i - 1];
    if (current == null || previous == null) continue;
    const dt = current - previous;

    // Un écart supérieur à une minute signale une pause : on ne compte pas
    // ce temps comme de l'entraînement. Les flux Strava ne sont pas à pas
    // constant (pauses, mode économie d'énergie de la montre).
    if (dt <= 0 || dt > 60) continue;

    const fraction = heartRateReserveFraction(hr, profile);
    trimp += (dt / 60) * fraction * banisterWeight(fraction, profile.sex);
    covered += dt;
  }

  return covered === 0 ? null : { trimp, coveredSeconds: covered };
}

/**
 * TRIMP approché à partir de la seule fréquence cardiaque moyenne.
 *
 * Utilisé quand le flux détaillé n'est pas disponible. À intensité inégale, la
 * pondération exponentielle étant convexe, cette forme SOUS-ESTIME la charge
 * d'une séance à intervalles. C'est pour cette raison que la méthode employée
 * est tracée dans `trimpMethod` et signalée comme estimée dans l'interface.
 */
export function trimpFromAverage(
  averageHr: number,
  durationSeconds: number,
  profile: HeartRateProfile,
): number {
  const fraction = heartRateReserveFraction(averageHr, profile);
  return (durationSeconds / 60) * fraction * banisterWeight(fraction, profile.sex);
}

/**
 * Charge de séance par la méthode RPE de Foster, ultime recours quand aucune
 * fréquence cardiaque n'est disponible.
 *
 * Source : Foster C. et al. (2001), « A new approach to monitoring exercise
 * training », Journal of Strength and Conditioning Research, 15(1), 109-115.
 *
 *   charge = RPE (échelle 1-10) × durée en minutes
 *
 * L'unité n'est PAS celle du TRIMP de Banister : les deux ne se comparent pas
 * directement et ne doivent jamais être mélangés dans une même série sans le
 * dire. Un facteur d'échelle est appliqué pour ramener les ordres de grandeur,
 * mais la valeur reste marquée comme estimée.
 */
export function trimpFromRpe(rpe: number, durationSeconds: number): number {
  const sessionLoad = Math.min(10, Math.max(1, rpe)) * (durationSeconds / 60);
  // Calage empirique : une heure à RPE 5 (endurance soutenue) vaut environ
  // 90 unités de TRIMP chez un coureur entraîné, soit 300 × 0,3.
  return sessionLoad * 0.3;
}

/** Provenance d'une valeur de charge, conservée pour ne jamais l'afficher comme mesurée si elle ne l'est pas. */
export type TrimpMethod =
  | "banister_stream"
  | "banister_average"
  | "rpe_foster"
  | "coros_native";

export const TRIMP_METHOD_LABELS: Record<TrimpMethod, string> = {
  banister_stream: "TRIMP de Banister, seconde par seconde",
  banister_average: "TRIMP de Banister sur la FC moyenne (sous-estime les fractionnés)",
  rpe_foster: "Charge de séance RPE × durée (Foster), faute de cardio",
  coros_native: "Charge calculée par la montre COROS",
};

/** Seule la valeur issue de la montre n'est pas une estimation de notre part. */
export function isEstimated(method: TrimpMethod): boolean {
  return method !== "coros_native";
}
