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

/**
 * Verdict générique quand la séance n'a pas été rapprochée d'une zone
 * prescrite (pas de plan actif, ou séance non planifiée) — « Majoritairement
 * en zone 2 (endurance fondamentale), 68 % du temps mesuré. » Utilisé par le
 * carnet de bord de l'accueil (section 3.6) quand le champ `notes` de
 * l'activité est vide.
 */
export function buildGenericZoneVerdict(
  secondsByZone: readonly number[] | null,
  zoneNames: readonly string[],
): string | null {
  const total = secondsByZone?.reduce((s, v) => s + v, 0) ?? 0;
  if (!secondsByZone || total === 0) return null;

  let bestIndex = 0;
  for (let i = 1; i < secondsByZone.length; i++) {
    if (secondsByZone[i]! > secondsByZone[bestIndex]!) bestIndex = i;
  }
  const pct = Math.round((secondsByZone[bestIndex]! / total) * 100);
  const name = zoneNames[bestIndex] ?? `zone ${bestIndex + 1}`;
  return `Majoritairement en zone ${bestIndex + 1} (${name}), ${pct} % du temps mesuré.`;
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
