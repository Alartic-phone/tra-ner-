/**
 * Enrichissement des tours (`Lap`) avec leur fenêtre temporelle dans
 * l'activité, pour permettre la sélection d'un split/tour sur la carte et
 * les graphiques.
 *
 * Les tours renvoyés par Strava — splits automatiques kilométriques et tours
 * manuels confondus — forment, dans l'ordre de `lapIndex`, une partition
 * continue de l'activité, sans trou ni recouvrement : la somme cumulée des
 * durées suffit à retrouver l'instant de départ de chacun.
 */

export type LapInput = {
  id: string;
  lapIndex: number;
  splitIndex: number | null;
  name: string | null;
  distanceM: number;
  movingTimeS: number;
  elapsedTimeS: number;
  elevationGainM: number | null;
  avgSpeedMps: number | null;
  avgHr: number | null;
  maxHr: number | null;
};

export type EnrichedLap = LapInput & {
  /** Secondes écoulées depuis le départ de l'activité, bornes du tour. */
  startT: number;
  endT: number;
};

export function enrichLaps(laps: readonly LapInput[]): EnrichedLap[] {
  let cumulative = 0;
  return laps.map((lap) => {
    const startT = cumulative;
    cumulative += lap.elapsedTimeS;
    return { ...lap, startT, endT: cumulative };
  });
}
