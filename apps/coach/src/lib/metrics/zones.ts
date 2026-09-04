/**
 * Zones de fréquence cardiaque et zones d'allure.
 */

export type HeartRateZone = {
  index: 1 | 2 | 3 | 4 | 5;
  name: string;
  /** Bornes en fraction de la FC au SEUIL (pas de la réserve cardiaque). */
  fromFraction: number;
  toFraction: number;
  /** Bornes en battements par minute. */
  fromBpm: number;
  toBpm: number;
};

/**
 * SOURCE UNIQUE des bornes de zone cardiaque, en pourcentage de la FC au
 * seuil. Aucun autre fichier ne doit redéfinir cette table ni recalculer des
 * bornes de zone : `zones-source-unique.test.ts` échoue si une deuxième
 * table apparaît ailleurs dans `src/`.
 *
 * Alignées sur les zones telles que configurées sur la montre et le plan de
 * l'utilisateur (FC seuil testée sur le terrain, ex. 175 bpm le 29/08/2026),
 * qui font foi — pas une formule de manuel. Avec un seuil à 175 bpm, ces
 * fractions redonnent Z1 < 140, Z2 140-158, Z3 159-166, Z4 167-179, Z5
 * 180-186, à l'arrondi près.
 *
 * La méthode de Karvonen (réserve cardiaque = FC_max − FC_repos) a été
 * retirée du calcul des zones : elle produisait des bornes différentes de
 * celles de la montre et du plan pour la même séance, ce qui n'est jamais
 * acceptable pour une même métrique. Un seul modèle de zones existe dans
 * l'application.
 */
const HR_ZONE_BOUNDS: Array<{
  index: 1 | 2 | 3 | 4 | 5;
  name: string;
  from: number;
  to: number;
}> = [
  { index: 1, name: "Récupération", from: 0, to: 0.8 },
  { index: 2, name: "Endurance fondamentale", from: 0.8, to: 0.9 },
  { index: 3, name: "Endurance active", from: 0.9, to: 0.95 },
  { index: 4, name: "Seuil", from: 0.95, to: 1.02 },
  { index: 5, name: "VMA", from: 1.02, to: 1.1 },
];

/**
 * Cinq zones de fréquence cardiaque en pourcentage de la FC au seuil.
 *
 * `thresholdHr` est la FC de seuil (lactate/anaérobie), mesurée sur le
 * terrain — la seule entrée qui détermine les bornes. `hrMaxCap`, s'il est
 * renseigné, fixe seulement le haut d'affichage de la zone 5 (elle est
 * ouverte par nature : rien n'empêche de dépasser 110 % du seuil sur un
 * sprint). Sans lui, ce haut reste la borne à 110 % — un simple plafond
 * d'axe, pas une mesure.
 */
export function computeHeartRateZones(
  thresholdHr: number,
  hrMaxCap?: number | null,
): HeartRateZone[] {
  if (thresholdHr <= 0) return [];

  return HR_ZONE_BOUNDS.map((z) => {
    const isTop = z.index === 5;
    const to =
      isTop && hrMaxCap != null && hrMaxCap > thresholdHr * z.from
        ? hrMaxCap
        : Math.round(thresholdHr * z.to);
    return {
      index: z.index,
      name: z.name,
      fromFraction: z.from,
      toFraction: z.to,
      fromBpm: Math.round(thresholdHr * z.from),
      toBpm: to,
    };
  });
}

/** Zone correspondant à une fréquence cardiaque donnée, ou `null` sous la zone 1. */
export function zoneForHeartRate(hr: number, zones: readonly HeartRateZone[]): HeartRateZone | null {
  for (const zone of zones) {
    if (hr >= zone.fromBpm && hr < zone.toBpm) return zone;
  }
  const last = zones[zones.length - 1];
  return last && hr >= last.toBpm ? last : null;
}

/**
 * Répartition du temps passé par zone, à partir du flux cardiaque.
 * Retourne des secondes par zone, plus le temps hors zone et le temps non mesuré.
 */
export function timeInZones(
  heartrate: ReadonlyArray<number | null>,
  time: ReadonlyArray<number>,
  zones: readonly HeartRateZone[],
): { byZone: Map<number, number>; belowZone1: number; unmeasured: number } {
  const byZone = new Map<number, number>(zones.map((z) => [z.index, 0]));
  let belowZone1 = 0;
  let unmeasured = 0;
  const n = Math.min(heartrate.length, time.length);

  // Même convention que le calcul de TRIMP : l'intervalle précédent, le
  // premier échantillon étant exclu.
  for (let i = 1; i < n; i++) {
    const current = time[i];
    const previous = time[i - 1];
    if (current == null || previous == null) continue;
    const dt = current - previous;
    if (dt <= 0 || dt > 60) continue;

    const hr = heartrate[i];
    if (hr == null) {
      unmeasured += dt;
      continue;
    }
    const zone = zoneForHeartRate(hr, zones);
    if (!zone) {
      belowZone1 += dt;
      continue;
    }
    byZone.set(zone.index, (byZone.get(zone.index) ?? 0) + dt);
  }

  return { byZone, belowZone1, unmeasured };
}

/**
 * Fréquence cardiaque moyenne pondérée par le temps EN MOUVEMENT, comme
 * l'allure. Strava calcule sa propre `average_speed` sur distance /
 * moving_time, mais sa `average_heartrate` de résumé moyenne tous les
 * échantillons sans exclure les arrêts — d'où un écart de 1 à 2 bpm avec la
 * valeur affichée par la montre, qui exclut déjà les arrêts. Même seuil de
 * vitesse que le calcul d'allure (`streams.ts`, 0,5 m/s) pour rester
 * cohérent entre les deux métriques dérivées du même flux.
 *
 * `null` sans flux de vitesse pour départager mouvement et arrêt : on
 * retombe alors sur la valeur communiquée par la source plutôt que
 * d'inventer un filtre.
 */
export function computeMovingAverageHr(
  heartrate: ReadonlyArray<number | null>,
  time: ReadonlyArray<number>,
  velocityMps: ReadonlyArray<number | null> | undefined,
  movingThresholdMps = 0.5,
): number | null {
  if (!velocityMps) return null;
  const n = Math.min(heartrate.length, time.length, velocityMps.length);

  // Même convention que le calcul de TRIMP et la répartition par zones :
  // l'intervalle précédent, le premier échantillon étant exclu.
  let weightedSum = 0;
  let totalDt = 0;
  for (let i = 1; i < n; i++) {
    const current = time[i];
    const previous = time[i - 1];
    if (current == null || previous == null) continue;
    const dt = current - previous;
    if (dt <= 0 || dt > 60) continue;

    const hr = heartrate[i];
    const v = velocityMps[i];
    if (hr == null || v == null || v <= movingThresholdMps) continue;

    weightedSum += hr * dt;
    totalDt += dt;
  }

  return totalDt > 0 ? weightedSum / totalDt : null;
}

export type PaceZone = {
  name: string;
  /** Bornes en pourcentage de VMA. */
  fromVmaPct: number;
  toVmaPct: number;
  /** Bornes d'allure en secondes par kilomètre. La plus RAPIDE est `fastest`. */
  fastestSPerKm: number;
  slowestSPerKm: number;
};

const PACE_ZONE_BOUNDS: Array<{ name: string; from: number; to: number }> = [
  { name: "Récupération", from: 0.5, to: 0.6 },
  { name: "Endurance fondamentale", from: 0.6, to: 0.7 },
  { name: "Endurance active", from: 0.7, to: 0.8 },
  { name: "Seuil (allure semi)", from: 0.8, to: 0.87 },
  { name: "Seuil anaérobie (allure 10 km)", from: 0.87, to: 0.92 },
  { name: "VMA longue", from: 0.92, to: 1.0 },
  { name: "VMA courte", from: 1.0, to: 1.1 },
];

/**
 * Zones d'allure exprimées en pourcentage de VMA.
 *
 * Les bornes sont celles de la tradition d'entraînement française (Cazorla,
 * Billat), où l'intensité se raisonne en pourcentage de vitesse maximale
 * aérobie plutôt qu'en pourcentage de VO2max.
 *
 * Conversion : une vitesse de v km/h correspond à une allure de 3600/v
 * secondes par kilomètre. Une allure plus PETITE est plus rapide, d'où
 * l'inversion des bornes.
 */
export function computePaceZones(vmaKmh: number): PaceZone[] {
  if (vmaKmh <= 0) return [];
  return PACE_ZONE_BOUNDS.map((z) => ({
    name: z.name,
    fromVmaPct: z.from,
    toVmaPct: z.to,
    fastestSPerKm: 3600 / (vmaKmh * z.to),
    slowestSPerKm: 3600 / (vmaKmh * z.from),
  }));
}

/** Allure (s/km) correspondant à un pourcentage de VMA. */
export function paceAtVmaPercent(vmaKmh: number, percent: number): number {
  return 3600 / (vmaKmh * percent);
}

/**
 * Estimation de VMA à partir d'un chrono récent sur une distance de référence.
 *
 * Approximation courante : la vitesse soutenue sur 6 minutes est très proche
 * de la VMA ; sur des efforts plus longs, un abattement s'applique. La valeur
 * retournée est donc une ESTIMATION et doit être présentée comme telle — la
 * seule mesure fiable reste un test de terrain (demi-Cooper, Vameval).
 */
export function estimateVmaFromRace(distanceM: number, timeSeconds: number): number | null {
  if (distanceM <= 0 || timeSeconds <= 0) return null;
  const speedKmh = (distanceM / 1000) / (timeSeconds / 3600);
  const minutes = timeSeconds / 60;

  // Fraction de VMA tenable selon la durée de l'effort, d'après les tables
  // usuelles : ~100 % à 6 min, ~92 % à 20 min, ~87 % à 45 min, ~84 % à 1 h 30.
  const fraction =
    minutes <= 6 ? 1
    : minutes <= 20 ? 1 - ((minutes - 6) / 14) * 0.08
    : minutes <= 45 ? 0.92 - ((minutes - 20) / 25) * 0.05
    : minutes <= 90 ? 0.87 - ((minutes - 45) / 45) * 0.03
    : 0.84;

  return speedKmh / fraction;
}
