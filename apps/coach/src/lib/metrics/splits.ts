/**
 * Splits kilométriques calculés depuis les flux seconde par seconde.
 *
 * Distincts des `Lap` (tours manuels posés par l'athlète, ou auto-lap du
 * capteur) : ici, la distance cumulée du flux est simplement découpée tous
 * les 1000 m par interpolation linéaire du temps au point de franchissement,
 * comme le fait Strava pour ses "splits_metric". Aucune activité n'a besoin
 * d'avoir posé de lap pour que ce découpage existe.
 */

export type KmSplit = {
  index: number;
  /** Distance réellement couverte par ce split — 1000 sauf le dernier, partiel. */
  distanceM: number;
  timeS: number;
  paceSPerKm: number | null;
  avgHr: number | null;
  /** Somme des montées / descentes dans le split. `null` sans flux d'altitude. */
  elevGainM: number | null;
  elevLossM: number | null;
  /** Vrai pour le dernier split s'il ne couvre pas un kilomètre complet. */
  partial: boolean;
};

/**
 * Découpe une activité en splits de `splitMeters` (1000 par défaut).
 *
 * `distance` doit être croissante (cumulée). Les échantillons dont la
 * distance est absente sont ignorés pour la moyenne de FC et le dénivelé
 * mais n'interrompent pas le calcul — un capteur qui décroche un instant ne
 * doit pas faire disparaître tout le split.
 */
export function computeKmSplits(
  time: ReadonlyArray<number>,
  distance: ReadonlyArray<number | null>,
  heartrate: ReadonlyArray<number | null> | undefined,
  altitude: ReadonlyArray<number | null> | undefined,
  splitMeters = 1000,
): KmSplit[] {
  const n = Math.min(time.length, distance.length);
  if (n < 2) return [];

  // Interpole le temps auquel chaque seuil de distance est franchi.
  const crossingTime = (thresholdM: number): number | null => {
    for (let i = 1; i < n; i++) {
      const d0 = distance[i - 1];
      const d1 = distance[i];
      if (d0 == null || d1 == null || d1 < d0) continue;
      if (d0 <= thresholdM && thresholdM <= d1) {
        const t0 = time[i - 1]!;
        const t1 = time[i]!;
        const span = d1 - d0;
        return span > 0 ? t0 + ((thresholdM - d0) / span) * (t1 - t0) : t0;
      }
    }
    return null;
  };

  const totalDistance = lastNonNull(distance) ?? 0;
  if (totalDistance <= 0) return [];

  const splitCount = Math.ceil(totalDistance / splitMeters);
  const splits: KmSplit[] = [];

  let prevTime = time[0]!;
  let prevThreshold = 0;

  for (let s = 1; s <= splitCount; s++) {
    const threshold = Math.min(s * splitMeters, totalDistance);
    const partial = threshold - prevThreshold < splitMeters - 1e-6;
    const boundaryTime = s === splitCount ? lastNonNull(time) : crossingTime(threshold);
    if (boundaryTime == null) break;

    const { avgHr, elevGainM, elevLossM } = summarizeWindow(
      time,
      heartrate,
      altitude,
      prevTime,
      boundaryTime,
    );

    splits.push({
      index: s,
      distanceM: threshold - prevThreshold,
      timeS: boundaryTime - prevTime,
      paceSPerKm:
        threshold > prevThreshold
          ? ((boundaryTime - prevTime) / (threshold - prevThreshold)) * 1000
          : null,
      avgHr,
      elevGainM,
      elevLossM,
      partial,
    });

    prevTime = boundaryTime;
    prevThreshold = threshold;
  }

  return splits;
}

function lastNonNull(series: ReadonlyArray<number | null>): number | null {
  for (let i = series.length - 1; i >= 0; i--) {
    if (series[i] != null) return series[i]!;
  }
  return null;
}

function summarizeWindow(
  time: ReadonlyArray<number>,
  heartrate: ReadonlyArray<number | null> | undefined,
  altitude: ReadonlyArray<number | null> | undefined,
  fromT: number,
  toT: number,
): { avgHr: number | null; elevGainM: number | null; elevLossM: number | null } {
  let hrSum = 0;
  let hrCount = 0;
  let gain = 0;
  let loss = 0;
  let hasAltitude = false;
  let prevAlt: number | null = null;

  const n = time.length;
  for (let i = 0; i < n; i++) {
    const t = time[i]!;
    if (t < fromT || t > toT) continue;

    const hr = heartrate?.[i];
    if (hr != null) {
      hrSum += hr;
      hrCount += 1;
    }

    const alt = altitude?.[i];
    if (alt != null) {
      hasAltitude = true;
      if (prevAlt != null) {
        const delta = alt - prevAlt;
        if (delta > 0) gain += delta;
        else loss += -delta;
      }
      prevAlt = alt;
    }
  }

  return {
    avgHr: hrCount > 0 ? hrSum / hrCount : null,
    elevGainM: hasAltitude ? gain : null,
    elevLossM: hasAltitude ? loss : null,
  };
}
