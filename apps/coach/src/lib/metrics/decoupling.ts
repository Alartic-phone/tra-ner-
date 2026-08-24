/**
 * Découplage cardiaque (Pa:Hr).
 *
 * Source : Friel J., The Triathlete's Training Bible / Allen H. & Coggan A.,
 * Training and Racing with a Power Meter — notion d'« aerobic decoupling ».
 *
 * Principe : sur un effort d'intensité constante, on compare le rendement
 * (vitesse rapportée à la fréquence cardiaque) de la première moitié à celui
 * de la seconde. Si le cœur dérive à vitesse égale, l'endurance aérobie n'est
 * pas encore installée pour cette durée.
 *
 *   découplage = (rendement_1ère_moitié − rendement_2e_moitié) / rendement_1ère × 100
 *
 * Interprétation usuelle : sous 5 %, l'endurance est bonne pour la durée
 * considérée ; au-delà, la sortie était trop longue ou trop intense pour
 * l'état de forme actuel.
 *
 * NOTE : la variante Pw:Hr, fondée sur la puissance, n'est PAS calculable ici.
 * Elle exige un capteur de puissance de course, que ni Strava ni la COROS ne
 * fournissent sur cette chaîne de données. Seul Pa:Hr est donc disponible, et
 * il est plus sensible au vent et au dénivelé — d'où l'usage de l'allure
 * ajustée quand elle est disponible.
 */

export type DecouplingResult = {
  /** Écart de rendement entre les deux moitiés, en pourcentage. */
  decouplingPct: number;
  firstHalfEfficiency: number;
  secondHalfEfficiency: number;
  /** Secondes réellement exploitées (échantillons complets). */
  usedSeconds: number;
  estimated: true;
};

/**
 * Calcule le découplage entre les deux moitiés d'un effort.
 *
 * `warmupSeconds` écarte le début de séance : la fréquence cardiaque met
 * plusieurs minutes à rejoindre son plateau, et l'inclure gonflerait
 * artificiellement le rendement de la première moitié — donc le découplage.
 */
export function computeDecoupling(
  speed: ReadonlyArray<number | null>,
  heartrate: ReadonlyArray<number | null>,
  time: ReadonlyArray<number>,
  options: { warmupSeconds?: number; minSeconds?: number } = {},
): DecouplingResult | null {
  const warmup = options.warmupSeconds ?? 600;
  const minSeconds = options.minSeconds ?? 1800;

  const n = Math.min(speed.length, heartrate.length, time.length);
  if (n === 0) return null;

  const start = time[0] ?? 0;
  const samples: Array<{ t: number; speed: number; hr: number }> = [];

  for (let i = 0; i < n; i++) {
    const t = time[i];
    const s = speed[i];
    const hr = heartrate[i];
    if (t == null || s == null || hr == null) continue;
    if (t - start < warmup) continue;
    // Un arrêt ou une marche ne renseigne pas sur le rendement aérobie.
    if (s < 1.5 || hr < 60) continue;
    samples.push({ t, speed: s, hr });
  }

  if (samples.length < 2) return null;
  const duration = samples[samples.length - 1]!.t - samples[0]!.t;
  // Le découplage n'a de sens que sur un effort prolongé : sur trente minutes
  // de fractionné, il mesurerait la structure de la séance, pas l'endurance.
  if (duration < minSeconds) return null;

  const midpoint = samples[0]!.t + duration / 2;
  const first = samples.filter((s) => s.t < midpoint);
  const second = samples.filter((s) => s.t >= midpoint);
  if (first.length === 0 || second.length === 0) return null;

  const efficiency = (list: typeof samples): number => {
    const meanSpeed = list.reduce((a, s) => a + s.speed, 0) / list.length;
    const meanHr = list.reduce((a, s) => a + s.hr, 0) / list.length;
    return meanHr > 0 ? meanSpeed / meanHr : 0;
  };

  const e1 = efficiency(first);
  const e2 = efficiency(second);
  if (e1 <= 0) return null;

  return {
    decouplingPct: ((e1 - e2) / e1) * 100,
    firstHalfEfficiency: e1,
    secondHalfEfficiency: e2,
    usedSeconds: duration,
    estimated: true,
  };
}

/** Lecture qualitative du découplage. */
export function decouplingVerdict(pct: number): "bon" | "correct" | "eleve" {
  if (pct < 5) return "bon";
  if (pct < 10) return "correct";
  return "eleve";
}
