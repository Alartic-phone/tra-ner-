/**
 * Allure ajustée du dénivelé (GAP — Grade Adjusted Pace).
 *
 * Source : Minetti A.E., Moia C., Roi G.S., Susta D., Ferretti G. (2002),
 * « Energy cost of walking and running at extreme uphill and downhill slopes »,
 * Journal of Applied Physiology, 93(3), 1039-1046.
 *
 * Minetti donne le coût énergétique de la course en fonction de la pente i
 * (en tangente, donc 0,05 pour 5 %) :
 *
 *   Cr(i) = 155,4·i⁵ − 30,4·i⁴ − 43,3·i³ + 46,3·i² + 19,5·i + 3,6   (J/kg/m)
 *
 * Le rapport Cr(i)/Cr(0) donne le surcoût relatif de la pente. L'allure
 * ajustée est l'allure qu'on aurait tenue sur le plat pour la même dépense.
 *
 * IMPORTANT : c'est une ESTIMATION, et elle doit toujours être présentée comme
 * telle. Strava n'expose pas sa propre GAP par l'API — seulement dans son
 * interface — et son modèle propriétaire est moins pentu que celui de Minetti,
 * surtout en montée. Les deux valeurs ne coïncideront donc pas.
 */

/** Coût énergétique de la course sur pente `grade` (tangente), en J/kg/m. */
export function minettiCost(grade: number): number {
  // Le polynôme n'est validé que sur [−0,45 ; +0,45] ; au-delà il diverge.
  const i = Math.min(0.45, Math.max(-0.45, grade));
  return (
    155.4 * i ** 5 -
    30.4 * i ** 4 -
    43.3 * i ** 3 +
    46.3 * i ** 2 +
    19.5 * i +
    3.6
  );
}

/** Coût sur le plat, référence du rapport. */
export const FLAT_COST = 3.6;

/** Facteur multiplicatif de la pente : 1 sur le plat, > 1 en montée. */
export function gradeFactor(grade: number): number {
  return minettiCost(grade) / FLAT_COST;
}

/**
 * Lisse un profil altimétrique.
 *
 * L'altitude GPS est bruitée de plusieurs mètres d'un point à l'autre. Sans
 * lissage, la pente instantanée oscille de façon absurde entre ±30 % sur du
 * plat, et le facteur de correction devient du bruit amplifié. La fenêtre est
 * exprimée en nombre d'échantillons.
 */
export function smoothAltitude(
  altitude: ReadonlyArray<number | null>,
  window = 15,
): Array<number | null> {
  const half = Math.floor(window / 2);
  return altitude.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(altitude.length - 1, i + half); j++) {
      const v = altitude[j];
      if (v == null) continue;
      sum += v;
      count += 1;
    }
    return count === 0 ? null : sum / count;
  });
}

export type GapResult = {
  /** Allure ajustée moyenne, en secondes par kilomètre. */
  gapSPerKm: number;
  /** Allure réelle moyenne, pour comparaison. */
  actualSPerKm: number;
  /** Part de la distance réellement exploitable pour le calcul. */
  coverage: number;
  /** Toujours vrai : cette valeur est un modèle, pas une mesure. */
  estimated: true;
};

/**
 * Allure ajustée du dénivelé sur toute une activité.
 *
 * Le calcul se fait segment par segment puis est pondéré par la distance :
 * une correction moyennée dans le temps donnerait un poids excessif aux
 * portions lentes, c'est-à-dire précisément aux montées.
 */
export function computeGap(
  distance: ReadonlyArray<number | null>,
  altitude: ReadonlyArray<number | null>,
  time: ReadonlyArray<number>,
  options: { minSegmentM?: number } = {},
): GapResult | null {
  const minSegment = options.minSegmentM ?? 10;
  const n = Math.min(distance.length, altitude.length, time.length);
  if (n < 2) return null;

  const smoothed = smoothAltitude(altitude);

  let adjustedTime = 0;
  let actualTime = 0;
  let usedDistance = 0;
  let totalDistance = 0;

  let anchor = 0;
  for (let i = 1; i < n; i++) {
    const d0 = distance[anchor];
    const d1 = distance[i];
    if (d0 == null || d1 == null) {
      anchor = i;
      continue;
    }

    const dd = d1 - d0;
    if (dd < minSegment) continue; // On agrège jusqu'à un segment significatif.

    const t0 = time[anchor] ?? 0;
    const t1 = time[i] ?? 0;
    const dt = t1 - t0;
    totalDistance += dd;

    // Un segment très lent est un arrêt ou une marche : l'inclure fausserait
    // la moyenne sans rien apprendre sur la pente.
    if (dt <= 0 || dt > 120) {
      anchor = i;
      continue;
    }

    const a0 = smoothed[anchor];
    const a1 = smoothed[i];
    if (a0 == null || a1 == null) {
      anchor = i;
      continue;
    }

    const grade = (a1 - a0) / dd;
    // Le temps équivalent sur le plat est le temps réel divisé par le surcoût
    // de la pente : une montée coûteuse « vaut » un temps plus court à plat.
    adjustedTime += dt / gradeFactor(grade);
    actualTime += dt;
    usedDistance += dd;
    anchor = i;
  }

  if (usedDistance <= 0 || adjustedTime <= 0) return null;

  return {
    gapSPerKm: (adjustedTime / usedDistance) * 1000,
    actualSPerKm: (actualTime / usedDistance) * 1000,
    coverage: totalDistance > 0 ? usedDistance / totalDistance : 0,
    estimated: true,
  };
}
