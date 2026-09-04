/**
 * Phrases construites PAR LE CODE à partir de données réellement mesurées —
 * jamais par un modèle (CLAUDE.md, section « le modèle propose, le code
 * arbitre »). Fonctions PURES, testées.
 */

/** « Prescrite en zone 2, réalisée à 79 % en zone 2. » */
export function buildZoneVerdict(
  targetHrZone: number,
  secondsByZone: readonly number[] | null,
): string {
  const total = secondsByZone?.reduce((s, v) => s + v, 0) ?? 0;
  if (!secondsByZone || total === 0) {
    return `Prescrite en zone ${targetHrZone}, réalisation non mesurable (pas de cardio enregistré).`;
  }
  const inZone = secondsByZone[targetHrZone - 1] ?? 0;
  const pct = Math.round((inZone / total) * 100);
  return `Prescrite en zone ${targetHrZone}, réalisée à ${pct} % en zone ${targetHrZone}.`;
}

/** Index du split le plus rapide (pace la plus faible), ou -1 si aucun split chronométrable. */
export function fastestSplitIndex(
  splits: readonly { distanceM: number; movingTimeS: number }[],
): number {
  let best = -1;
  let bestPace = Infinity;
  splits.forEach((s, i) => {
    if (s.distanceM <= 0 || s.movingTimeS <= 0) return;
    const pace = s.movingTimeS / (s.distanceM / 1000);
    if (pace < bestPace) {
      bestPace = pace;
      best = i;
    }
  });
  return best;
}
