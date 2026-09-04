import type { BestEffort } from "./best-efforts.ts";

/**
 * Prédiction de performance.
 *
 * Trois modèles indépendants, volontairement conservés séparés : ils reposent
 * sur des hypothèses différentes et leur DÉSACCORD est une information. Une
 * prédiction est donc toujours restituée sous forme de fourchette, jamais
 * comme un chiffre unique.
 */

// ---------------------------------------------------------------------------
// Riegel
// ---------------------------------------------------------------------------

/**
 * Formule de Riegel.
 *
 * Source : Riegel P.S. (1981), « Athletic records and human endurance »,
 * American Scientist, 69(3), 285-290.
 *
 *   T₂ = T₁ × (D₂ / D₁)^b
 *
 * L'exposant b vaut 1,06 dans l'article original, ajusté sur des records du
 * monde. Il traduit le fait qu'on ralentit en allongeant la distance. Un
 * coureur bien endurant a un exposant plus faible (1,04-1,05), un coureur
 * orienté vitesse plus élevé (1,07-1,08) : c'est pourquoi il est paramétrable
 * et peut être ajusté sur les chronos réels.
 *
 * La formule perd sa validité au-delà d'un rapport de distances d'environ 4,
 * et sous-estime nettement la difficulté du marathon extrapolé depuis un 5 km.
 */
export const RIEGEL_EXPONENT = 1.06;

export function riegel(
  knownDistanceM: number,
  knownTimeS: number,
  targetDistanceM: number,
  exponent = RIEGEL_EXPONENT,
): number {
  return knownTimeS * (targetDistanceM / knownDistanceM) ** exponent;
}

/**
 * Ajuste l'exposant de Riegel sur deux performances réelles.
 *
 *   b = ln(T₂/T₁) / ln(D₂/D₁)
 *
 * Bien plus fiable que la valeur générique dès qu'on dispose de deux chronos
 * sur des distances suffisamment écartées.
 */
export function fitRiegelExponent(
  a: { distanceM: number; timeS: number },
  b: { distanceM: number; timeS: number },
): number | null {
  if (a.distanceM <= 0 || b.distanceM <= 0 || a.timeS <= 0 || b.timeS <= 0) return null;
  const ratio = b.distanceM / a.distanceM;
  if (Math.abs(Math.log(ratio)) < 0.1) return null; // Distances trop proches.
  return Math.log(b.timeS / a.timeS) / Math.log(ratio);
}

// ---------------------------------------------------------------------------
// VDOT de Daniels
// ---------------------------------------------------------------------------

/**
 * VO2 consommé à une vitesse donnée, en ml/kg/min.
 *
 * Source : Daniels J., Gilbert J. (1979), Oxygen Power: Performance Tables for
 * Distance Runners. Repris dans Daniels' Running Formula.
 *
 *   VO2 = −4,60 + 0,182258·v + 0,000104·v²    (v en mètres par minute)
 */
export function vo2AtVelocity(metersPerMinute: number): number {
  return -4.6 + 0.182258 * metersPerMinute + 0.000104 * metersPerMinute ** 2;
}

/**
 * Fraction de VO2max soutenable pendant une durée donnée.
 *
 *   %VO2max = 0,8 + 0,1894393·e^(−0,012778·t) + 0,2989558·e^(−0,1932605·t)
 *
 * avec t en minutes. Elle vaut environ 1 vers 10 minutes d'effort et décroît
 * ensuite : c'est ce qui distingue un VDOT d'un simple VO2 de course.
 */
export function fractionOfVo2Max(minutes: number): number {
  return (
    0.8 +
    0.1894393 * Math.exp(-0.012778 * minutes) +
    0.2989558 * Math.exp(-0.1932605 * minutes)
  );
}

/** VDOT correspondant à une performance sur route ou sur piste. */
export function vdotFromRace(distanceM: number, timeS: number): number | null {
  if (distanceM <= 0 || timeS <= 0) return null;
  const minutes = timeS / 60;
  const velocity = distanceM / minutes;
  return vo2AtVelocity(velocity) / fractionOfVo2Max(minutes);
}

/**
 * Vitesse (m/min) correspondant à une consommation d'oxygène donnée.
 * Inversion du polynôme de Daniels par la formule quadratique.
 */
export function velocityAtVo2(vo2: number): number {
  const a = 0.000104;
  const b = 0.182258;
  const c = -(4.6 + vo2);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return 0;
  return (-b + Math.sqrt(discriminant)) / (2 * a);
}

/**
 * Allures d'entraînement de Daniels, en secondes par kilomètre.
 *
 * Les pourcentages de VO2max sont ceux de Daniels' Running Formula :
 * endurance 65-79 %, allure marathon 84 %, seuil 88 %, intervalles 98 %,
 * répétitions 105 %.
 */
export type DanielsPaces = {
  easySlowSPerKm: number;
  easyFastSPerKm: number;
  marathonSPerKm: number;
  thresholdSPerKm: number;
  intervalSPerKm: number;
  repetitionSPerKm: number;
};

export function danielsPaces(vdot: number): DanielsPaces {
  const paceAt = (fraction: number): number => {
    const velocity = velocityAtVo2(vdot * fraction);
    return velocity > 0 ? 60000 / velocity : 0; // m/min -> s/km
  };
  return {
    easySlowSPerKm: paceAt(0.65),
    easyFastSPerKm: paceAt(0.79),
    marathonSPerKm: paceAt(0.84),
    thresholdSPerKm: paceAt(0.88),
    intervalSPerKm: paceAt(0.98),
    repetitionSPerKm: paceAt(1.05),
  };
}

/**
 * Chrono prédit sur une distance à partir d'un VDOT.
 *
 * Il n'existe pas de forme analytique : la fraction de VO2max soutenable
 * dépend de la durée, qui est justement l'inconnue. On résout par itérations
 * successives, qui convergent en quelques passes.
 */
export function predictTimeFromVdot(vdot: number, distanceM: number): number | null {
  if (vdot <= 0 || distanceM <= 0) return null;

  let minutes = distanceM / velocityAtVo2(vdot * 0.9);
  for (let i = 0; i < 30; i++) {
    const velocity = velocityAtVo2(vdot * fractionOfVo2Max(minutes));
    if (velocity <= 0) return null;
    const next = distanceM / velocity;
    if (Math.abs(next - minutes) < 1e-4) {
      minutes = next;
      break;
    }
    minutes = next;
  }
  return minutes * 60;
}

// ---------------------------------------------------------------------------
// Vitesse critique
// ---------------------------------------------------------------------------

export type CriticalSpeed = {
  /** Vitesse critique en m/s : l'allure théoriquement tenable indéfiniment. */
  csMps: number;
  /** Réserve de distance anaérobie D' (« D prime »), en mètres. */
  dPrimeM: number;
  /** Coefficient de détermination de la régression, dans [0, 1]. */
  r2: number;
  sampleCount: number;
  /**
   * Durée du plus long effort de référence réellement utilisé par la
   * régression (pas la borne déclarée `maxDurationS`, qui peut dépasser ce
   * qui est réellement disponible).
   */
  maxSampleDurationS: number;
};

/**
 * Une projection au-delà de deux fois la durée du plus long effort de
 * référence sort du domaine que la régression a effectivement observé :
 * extrapoler un marathon depuis des efforts de 2 à 30 minutes n'a plus de
 * valeur prédictive, seulement l'apparence d'en avoir une.
 */
export function isCriticalSpeedInDomain(timeS: number, cs: CriticalSpeed): boolean {
  return timeS <= cs.maxSampleDurationS * 2;
}

/**
 * Modèle de vitesse critique par régression linéaire distance/temps.
 *
 * Source : Monod H., Scherrer J. (1965), « The work capacity of a synergic
 * muscular group », Ergonomics, 8(3), 329-338 ; transposé à la course par
 * Hughson, Orok & Staudt (1984).
 *
 *   d = CS · t + D'
 *
 * La pente de la droite est la vitesse critique, l'ordonnée à l'origine la
 * réserve anaérobie. Les efforts de moins de deux minutes en sont exclus :
 * ils sont dominés par la filière anaérobie et courbent la relation, ce qui
 * fausserait la pente.
 */
export function computeCriticalSpeed(
  efforts: ReadonlyArray<{ durationS: number; distanceM: number }>,
  options: { minDurationS?: number; maxDurationS?: number } = {},
): CriticalSpeed | null {
  const minDuration = options.minDurationS ?? 120;
  const maxDuration = options.maxDurationS ?? 1800;

  const points = efforts.filter(
    (e) => e.durationS >= minDuration && e.durationS <= maxDuration && e.distanceM > 0,
  );
  if (points.length < 3) return null;

  const n = points.length;
  const sumT = points.reduce((a, p) => a + p.durationS, 0);
  const sumD = points.reduce((a, p) => a + p.distanceM, 0);
  const sumTT = points.reduce((a, p) => a + p.durationS ** 2, 0);
  const sumTD = points.reduce((a, p) => a + p.durationS * p.distanceM, 0);

  const denominator = n * sumTT - sumT ** 2;
  if (denominator === 0) return null;

  const slope = (n * sumTD - sumT * sumD) / denominator;
  const intercept = (sumD - slope * sumT) / n;
  if (slope <= 0) return null;

  const meanD = sumD / n;
  const ssTot = points.reduce((a, p) => a + (p.distanceM - meanD) ** 2, 0);
  const ssRes = points.reduce(
    (a, p) => a + (p.distanceM - (slope * p.durationS + intercept)) ** 2,
    0,
  );

  return {
    csMps: slope,
    dPrimeM: intercept,
    r2: ssTot > 0 ? 1 - ssRes / ssTot : 0,
    sampleCount: n,
    maxSampleDurationS: Math.max(...points.map((p) => p.durationS)),
  };
}

/** Chrono prédit par le modèle de vitesse critique : t = (d − D') / CS. */
export function predictTimeFromCriticalSpeed(
  cs: CriticalSpeed,
  distanceM: number,
): number | null {
  const time = (distanceM - cs.dPrimeM) / cs.csMps;
  return time > 0 ? time : null;
}

// ---------------------------------------------------------------------------
// Synthèse
// ---------------------------------------------------------------------------

export type PredictionSource = "riegel" | "vdot" | "vitesse_critique";

/**
 * Domaine de plausibilité d'une allure de course à pied. En-deçà de 3'00/km,
 * c'est un sprint qu'aucun modèle de fond n'a vocation à prédire ; au-delà de
 * 12'00/km, ce n'est plus de la course. Un modèle dont la sortie tombe hors
 * de cette plage n'est pas « une estimation prudente », c'est le symptôme
 * d'un modèle mal alimenté (confusion d'unité, extrapolation dégénérée) — il
 * ne doit jamais polluer l'agrégat.
 */
export const PLAUSIBLE_PACE_S_PER_KM = { min: 180, max: 720 } as const;

export function isPlausiblePrediction(timeS: number, distanceM: number): boolean {
  if (distanceM <= 0) return false;
  const paceSPerKm = timeS / (distanceM / 1000);
  return paceSPerKm >= PLAUSIBLE_PACE_S_PER_KM.min && paceSPerKm <= PLAUSIBLE_PACE_S_PER_KM.max;
}

export const SOURCE_LABELS: Record<PredictionSource, string> = {
  riegel: "Riegel",
  vdot: "VDOT (Daniels)",
  vitesse_critique: "Vitesse critique",
};

function formatPaceLabel(timeS: number, distanceM: number): string {
  const paceSPerKm = timeS / (distanceM / 1000);
  const m = Math.floor(paceSPerKm / 60);
  const s = Math.round(paceSPerKm % 60);
  return `${m}'${String(s).padStart(2, "0")}/km`;
}

export type Prediction = {
  distanceM: number;
  /** Estimations retenues (plausibles), par modèle. */
  bySource: Array<{ source: PredictionSource; timeS: number }>;
  /**
   * Modèles exclus de l'agrégat car hors du domaine de plausibilité —
   * affichés à part, jamais mélangés à la fourchette.
   */
  excluded: Array<{ source: PredictionSource; timeS: number }>;
  /** Médiane des modèles disponibles. */
  medianTimeS: number;
  /** Bornes de la fourchette affichée. */
  fastestTimeS: number;
  slowestTimeS: number;
  /**
   * Indice de confiance dans [0, 1], fondé sur le nombre de modèles
   * concordants, leur dispersion, et la fraîcheur des données sources.
   */
  confidence: number;
  /** Raisons lisibles de la confiance accordée, affichées telles quelles. */
  confidenceNotes: string[];
  /**
   * Jour de la performance de référence (le même effort que celui utilisé
   * par Riegel/VDOT, cf. `pickReferenceEffort`) — `null` seulement si aucun
   * effort n'était disponible. Toujours affiché, pas seulement quand elle
   * est vieille : une date connue vaut mieux qu'une ancienneté taisant sa
   * propre source.
   */
  referenceDay: string | null;
};

/**
 * Agrège les modèles en une fourchette.
 *
 * `sourceAgeDays` est l'ancienneté de la performance de référence : une
 * prédiction bâtie sur un chrono d'il y a huit mois ne vaut pas celle bâtie
 * sur une course du mois dernier, et l'indice de confiance doit le refléter.
 */
export function buildPrediction(
  distanceM: number,
  estimates: ReadonlyArray<{ source: PredictionSource; timeS: number | null }>,
  context: { sourceAgeDays: number | null; sampleCount: number; referenceDay?: string | null },
): Prediction | null {
  const computed = estimates.filter(
    (e): e is { source: PredictionSource; timeS: number } => e.timeS != null && e.timeS > 0,
  );

  // Un modèle hors du domaine de plausibilité n'est pas une estimation
  // prudente à conserver dans l'agrégat, c'est le symptôme d'un modèle mal
  // alimenté (référence trop courte extrapolée trop loin, régression
  // dégénérée…). Il est écarté, affiché à part, jamais mélangé à la
  // fourchette.
  const excluded = computed.filter((e) => !isPlausiblePrediction(e.timeS, distanceM));
  const valid = computed
    .filter((e) => isPlausiblePrediction(e.timeS, distanceM))
    .sort((a, b) => a.timeS - b.timeS);

  // Moins de deux modèles plausibles : pas assez pour une fourchette
  // significative, la prédiction entière devient non disponible plutôt que
  // de s'appuyer sur un seul modèle qui pourrait tout autant être aberrant.
  if (valid.length < 2) return null;

  const times = valid.map((e) => e.timeS);
  const median =
    times.length % 2 === 1
      ? times[(times.length - 1) / 2]!
      : (times[times.length / 2 - 1]! + times[times.length / 2]!) / 2;

  const fastest = times[0]!;
  const slowest = times[times.length - 1]!;
  const spread = median > 0 ? (slowest - fastest) / median : 1;

  const notes: string[] = [];
  let confidence = 1;

  if (valid.length === 2) {
    confidence *= 0.85;
  }

  for (const e of excluded) {
    notes.push(
      `${SOURCE_LABELS[e.source]} exclu de la fourchette : allure hors du domaine de ` +
        `plausibilité (${formatPaceLabel(e.timeS, distanceM)}).`,
    );
  }

  if (spread > 0.1) {
    confidence *= 0.7;
    notes.push(
      `Les modèles divergent de ${Math.round(spread * 100)} % : la fourchette est large.`,
    );
  }

  if (context.sourceAgeDays == null) {
    confidence *= 0.5;
    notes.push("Ancienneté des données de référence inconnue.");
  } else if (context.sourceAgeDays > 180) {
    confidence *= 0.5;
    notes.push(
      `Performance de référence vieille de ${Math.round(context.sourceAgeDays / 30)} mois.`,
    );
  } else if (context.sourceAgeDays > 90) {
    confidence *= 0.75;
    notes.push("Performance de référence vieille de plus de trois mois.");
  }

  if (context.sampleCount < 3) {
    confidence *= 0.8;
    notes.push("Peu de performances de référence exploitables.");
  }

  // La fourchette affichée est élargie quand la confiance est faible : une
  // prédiction incertaine doit avoir l'air incertaine.
  const margin = (1 - confidence) * 0.06;

  return {
    distanceM,
    bySource: valid,
    excluded,
    medianTimeS: median,
    fastestTimeS: fastest * (1 - margin),
    slowestTimeS: slowest * (1 + margin),
    confidence: Math.max(0, Math.min(1, confidence)),
    confidenceNotes: notes,
    referenceDay: context.referenceDay ?? null,
  };
}

/**
 * Compose les trois modèles à partir de meilleurs efforts réels, pour une
 * distance cible. La référence retenue pour Riegel et le VDOT est l'effort de
 * plus longue durée disponible : c'est le signal le plus proche d'un effort
 * d'endurance soutenu, donc le moins déformé par la filière anaérobie.
 *
 * Tableau vide en entrée -> trois estimations à `timeS: null`, jamais une
 * erreur : c'est à `buildPrediction` de décider quoi faire d'une entrée sans
 * données (il renvoie `null`).
 */
/**
 * L'effort de plus longue durée disponible : signal le plus proche d'un
 * effort d'endurance soutenu, donc le moins déformé par la filière
 * anaérobie. Sert de référence à la fois pour Riegel/VDOT et pour dater la
 * performance de référence (repository.ts) — les deux doivent désigner
 * exactement le même effort, jamais deux sélections qui divergent.
 */
export function pickReferenceEffort<T extends BestEffort>(efforts: readonly T[]): T | null {
  if (efforts.length === 0) return null;
  return efforts.reduce((best, e) => (e.durationS > best.durationS ? e : best));
}

export function estimatesForDistance(
  distanceM: number,
  efforts: readonly BestEffort[],
): Array<{ source: PredictionSource; timeS: number | null }> {
  const reference = pickReferenceEffort(efforts);
  if (!reference) {
    return [
      { source: "riegel", timeS: null },
      { source: "vdot", timeS: null },
      { source: "vitesse_critique", timeS: null },
    ];
  }

  const vdot = vdotFromRace(reference.distanceM, reference.durationS);
  const cs = computeCriticalSpeed(efforts);

  return [
    { source: "riegel", timeS: riegel(reference.distanceM, reference.durationS, distanceM) },
    { source: "vdot", timeS: vdot != null ? predictTimeFromVdot(vdot, distanceM) : null },
    {
      source: "vitesse_critique",
      timeS: cs ? predictTimeFromCriticalSpeed(cs, distanceM) : null,
    },
  ];
}

export type TrajectoryStatus = "avance" | "dans_les_temps" | "retard";

/**
 * Classe une prédiction de chrono par rapport à un objectif.
 *
 * L'objectif est une fourchette (borne basse = le plus rapide encore
 * réaliste, borne haute), pas un point unique — un chrono visé l'est
 * quasiment toujours. En avance : plus rapide que la borne basse. En retard :
 * plus lent que la borne haute. Entre les deux, dans les temps.
 *
 * `targetTimeS` accepte aussi un nombre unique pour compatibilité (objectif
 * pas encore élargi en fourchette) : dans ce cas, simple seuil applicatif —
 * PAS une formule tirée de la littérature — la tolérance par défaut (2 %)
 * absorbe le bruit normal d'une prédiction multi-modèles sans le
 * sur-interpréter comme un vrai écart de forme.
 */
export function classifyTrajectory(
  predictedTimeS: number,
  target: number | { minS: number; maxS: number },
  toleranceFraction = 0.02,
): TrajectoryStatus {
  if (typeof target !== "number") {
    if (predictedTimeS < target.minS) return "avance";
    if (predictedTimeS > target.maxS) return "retard";
    return "dans_les_temps";
  }
  const delta = (predictedTimeS - target) / target;
  if (delta <= -toleranceFraction) return "avance";
  if (delta >= toleranceFraction) return "retard";
  return "dans_les_temps";
}
