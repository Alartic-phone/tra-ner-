/**
 * Extraction des meilleurs efforts d'une activité.
 *
 * Deux lectures complémentaires du même flux :
 *   - la plus grande distance couverte dans une durée donnée ;
 *   - le meilleur temps réalisé sur une distance donnée.
 *
 * Ces efforts alimentent le modèle de vitesse critique et le suivi de
 * progression. Ils sont extraits des données réelles, jamais extrapolés : si
 * la sortie ne contient aucune fenêtre de vingt minutes, il n'y a pas de
 * meilleur effort sur vingt minutes.
 */

export type BestEffort = { durationS: number; distanceM: number };

/** Durées de référence, choisies pour couvrir les filières énergétiques. */
export const DEFAULT_DURATIONS = [60, 120, 300, 600, 1200, 1800, 3600] as const;

/** Distances de référence usuelles en course sur route. */
export const DEFAULT_DISTANCES = [400, 1000, 1609, 5000, 10000, 21097, 42195] as const;

type Series = {
  time: ReadonlyArray<number>;
  distance: ReadonlyArray<number | null>;
};

/** Ne conserve que les points où temps ET distance sont mesurés. */
function cleanSeries({ time, distance }: Series): Array<{ t: number; d: number }> {
  const out: Array<{ t: number; d: number }> = [];
  const n = Math.min(time.length, distance.length);
  for (let i = 0; i < n; i++) {
    const t = time[i];
    const d = distance[i];
    if (t == null || d == null) continue;
    // La distance cumulée est monotone : un recul signale une aberration GPS.
    const last = out[out.length - 1];
    if (last && (t < last.t || d < last.d)) continue;
    out.push({ t, d });
  }
  return out;
}

/**
 * Plus grande distance couverte dans chacune des durées demandées.
 *
 * Balayage à deux pointeurs : la fenêtre avance sans jamais revenir en
 * arrière, ce qui donne un coût linéaire là où une double boucle serait
 * quadratique — sur une sortie longue de trois heures échantillonnée à la
 * seconde, la différence est celle entre instantané et inutilisable.
 */
export function bestDistanceForDurations(
  series: Series,
  durations: ReadonlyArray<number> = DEFAULT_DURATIONS,
): BestEffort[] {
  const points = cleanSeries(series);
  if (points.length < 2) return [];

  const totalTime = points[points.length - 1]!.t - points[0]!.t;
  const results: BestEffort[] = [];

  for (const duration of durations) {
    if (duration > totalTime) continue;

    let best = 0;
    let start = 0;
    for (let end = 0; end < points.length; end++) {
      while (points[end]!.t - points[start]!.t > duration) start++;
      if (start === 0 && points[end]!.t - points[0]!.t < duration) continue;
      const covered = points[end]!.d - points[start]!.d;
      if (covered > best) best = covered;
    }

    if (best > 0) results.push({ durationS: duration, distanceM: best });
  }

  return results;
}

/** Meilleur temps réalisé sur chacune des distances demandées. */
export function bestTimeForDistances(
  series: Series,
  distances: ReadonlyArray<number> = DEFAULT_DISTANCES,
): BestEffort[] {
  const points = cleanSeries(series);
  if (points.length < 2) return [];

  const totalDistance = points[points.length - 1]!.d - points[0]!.d;
  const results: BestEffort[] = [];

  for (const target of distances) {
    if (target > totalDistance) continue;

    let best = Infinity;
    let start = 0;
    for (let end = 0; end < points.length; end++) {
      while (points[end]!.d - points[start]!.d >= target) {
        const elapsed = points[end]!.t - points[start]!.t;
        if (elapsed < best) best = elapsed;
        start++;
      }
    }

    if (Number.isFinite(best)) results.push({ durationS: best, distanceM: target });
  }

  return results;
}

/**
 * Fusionne les meilleurs efforts de plusieurs activités en ne gardant, pour
 * chaque durée, que le plus performant.
 */
export function mergeBestEfforts(
  efforts: ReadonlyArray<BestEffort>,
): BestEffort[] {
  const best = new Map<number, number>();
  for (const e of efforts) {
    const current = best.get(e.durationS);
    if (current == null || e.distanceM > current) best.set(e.durationS, e.distanceM);
  }
  return [...best.entries()]
    .map(([durationS, distanceM]) => ({ durationS, distanceM }))
    .sort((a, b) => a.durationS - b.durationS);
}
