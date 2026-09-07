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

/**
 * Allure au-delà de laquelle un segment n'est plus une course à pied
 * plausible — bien au-delà d'une marche. Un « meilleur effort » plus lent que
 * ça ne peut être qu'une activité mal étiquetée (typiquement une séance de
 * musculation démarrée en mode « course en salle », le capteur de distance
 * restant quasi figé) ou un capteur resté bloqué. Exclu à la source : ce
 * n'est jamais une course, donc jamais une donnée de référence pour Riegel,
 * le VDOT ou la vitesse critique.
 */
export const MAX_PLAUSIBLE_PACE_S_PER_KM = 720; // 12 min/km

/**
 * Allure en-deçà de laquelle un segment n'est plus une course à pied
 * plausible pour cet athlète — trois quarts de minute par kilomètre plus
 * vite que sa FC seuil mesurée sur le terrain (4'55/km). Un « meilleur
 * effort » plus rapide que ça n'est jamais un vrai sprint soutenu sur cette
 * distance : c'est un capteur de distance qui décroche (typiquement un
 * accéléromètre de tapis de course sur COROS PACE Pro en mode `trainer`, qui
 * peut produire un pic de vitesse fictif de quelques secondes avant de se
 * recaler). Confirmé sur une sortie réelle : "Night Run" du 12/07/2025
 * (tapis, `trainer: true`) contenait plusieurs segments entre 109 et
 * 182 s/km (33 à 20 km/h), qui polluaient silencieusement le meilleur
 * kilomètre et la vitesse critique sur 20 minutes — le vrai record sur
 * 20 minutes est la séance de seuil du 29/08 (4'55/km). Exclu à la source,
 * symétrique à `MAX_PLAUSIBLE_PACE_S_PER_KM`.
 */
export const MIN_PLAUSIBLE_PACE_S_PER_KM = 210; // 3'30/km (~17,1 km/h)

export function isPlausibleRunningPace(distanceM: number, durationS: number): boolean {
  if (distanceM <= 0) return false;
  const paceSPerKm = (durationS / distanceM) * 1000;
  return paceSPerKm <= MAX_PLAUSIBLE_PACE_S_PER_KM && paceSPerKm >= MIN_PLAUSIBLE_PACE_S_PER_KM;
}

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

    if (best > 0 && isPlausibleRunningPace(best, duration)) {
      results.push({ durationS: duration, distanceM: best });
    }
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
 *
 * Générique sur T plutôt que figé sur `{ durationS, distanceM }` : quand
 * l'appelant fait porter un champ `day` à chaque effort (repository.ts, pour
 * dater la performance de référence servant aux prédictions), il ressort
 * intact — recréer un objet appauvri ici l'aurait perdu silencieusement.
 */
export function mergeBestEfforts<T extends BestEffort>(efforts: ReadonlyArray<T>): T[] {
  const best = new Map<number, T>();
  for (const e of efforts) {
    const current = best.get(e.durationS);
    if (current == null || e.distanceM > current.distanceM) best.set(e.durationS, e);
  }
  return [...best.values()].sort((a, b) => a.durationS - b.durationS);
}

/**
 * Durées pour lesquelles les efforts d'une activité égalent ou dépassent le
 * meilleur historique — un record personnel, façon « MEILLEURS RÉSULTATS »
 * de Strava. `allTimeBest` doit déjà exclure l'activité elle-même n'a pas
 * besoin d'être exclue : si son propre effort EST le meilleur historique,
 * l'égalité déclenche bien le badge.
 */
export function detectPersonalRecords(
  current: ReadonlyArray<BestEffort>,
  allTimeBest: ReadonlyMap<number, number>,
): number[] {
  return current
    .filter((e) => {
      const best = allTimeBest.get(e.durationS);
      return best == null || e.distanceM >= best;
    })
    .map((e) => e.durationS)
    .sort((a, b) => a - b);
}
