/**
 * Normalisation des noms d'activité générés automatiquement par Strava
 * (« Evening Ride », « Morning run », mais aussi leurs équivalents français
 * selon la langue du compte au moment de l'enregistrement, « Course à pied
 * en soirée »). Un nom personnalisé (« Test de seuil », « Reprise ») n'est
 * JAMAIS touché : seuls les libellés reconnus comme génériques sont
 * retraduits, vers un libellé français dérivé du sport et de l'heure de
 * départ, pour ne plus mélanger les deux langues dans les mêmes listes.
 */

/**
 * `frVariants` couvre les formes que Strava génère RÉELLEMENT selon les
 * versions de son moteur de nommage (ex. WeightTraining -> « Entraînement
 * aux poids », observé dans les données réelles, pas « Musculation ») ; `fr`
 * est le libellé canonique qu'on réémet, choisi pour sa concision.
 */
const SPORT_LABELS: Record<string, { en: string; frVariants: string[]; fr: string }> = {
  Run: { en: "Run", frVariants: ["Course à pied"], fr: "Course à pied" },
  TrailRun: { en: "Trail Run", frVariants: ["Trail"], fr: "Trail" },
  VirtualRun: {
    en: "Virtual Run",
    frVariants: ["Course à pied virtuelle"],
    fr: "Course à pied virtuelle",
  },
  Ride: { en: "Ride", frVariants: ["Sortie vélo", "Vélo"], fr: "Sortie vélo" },
  VirtualRide: {
    en: "Virtual Ride",
    frVariants: ["Sortie vélo virtuelle"],
    fr: "Sortie vélo virtuelle",
  },
  EBikeRide: {
    en: "E-Bike Ride",
    frVariants: ["Sortie vélo électrique"],
    fr: "Sortie vélo électrique",
  },
  WeightTraining: {
    en: "Weight Training",
    frVariants: ["Musculation", "Entraînement aux poids"],
    fr: "Musculation",
  },
  Rowing: { en: "Rowing", frVariants: ["Rameur", "Aviron"], fr: "Rameur" },
  Hike: { en: "Hike", frVariants: ["Randonnée"], fr: "Randonnée" },
  Walk: { en: "Walk", frVariants: ["Marche"], fr: "Marche" },
  Swim: { en: "Swim", frVariants: ["Natation"], fr: "Natation" },
  Workout: { en: "Workout", frVariants: ["Entraînement"], fr: "Entraînement" },
};

const EN_TIME_WORDS = [
  "early morning",
  "morning",
  "midday",
  "lunch",
  "afternoon",
  "evening",
  "night",
];

// Variantes françaises observées ou plausibles selon la langue du compte
// Strava au moment de l'enregistrement.
const FR_TIME_PHRASES = [
  "du matin",
  "le matin",
  "matinale",
  "de la mi-journée",
  "le midi",
  "de l'après-midi",
  "dans l'après-midi",
  "du soir",
  "en soirée",
  "de nuit",
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Français, dérivé de l'heure locale de départ (0-23), pour un libellé regénéré. */
function frTimeOfDay(localHour: number): string {
  if (localHour < 6) return "de nuit";
  if (localHour < 12) return "du matin";
  if (localHour < 14) return "de la mi-journée";
  if (localHour < 18) return "de l'après-midi";
  if (localHour < 21) return "du soir";
  return "de nuit";
}

/**
 * `Activity.type` de Strava est parfois plus générique que le sport réel
 * (une trail vue par le compte reste `type: "Run"`, le détail passant par
 * `sportType`) : pour "Run", on tente aussi les variantes courantes plutôt
 * que de rater « Morning Trail Run » faute de correspondance exacte.
 */
function candidateSportTypes(type: string): string[] {
  return type === "Run" ? ["Run", "TrailRun", "VirtualRun"] : [type];
}

/** Le libellé du sport (candidat matché) si `name` suit un patron générique Strava (EN ou FR). */
function matchGenericSport(name: string, type: string): (typeof SPORT_LABELS)[string] | null {
  const trimmed = name.trim();
  const frTimeGroup = FR_TIME_PHRASES.map(escapeRegExp).join("|");

  for (const candidate of candidateSportTypes(type)) {
    const sport = SPORT_LABELS[candidate];
    if (!sport) continue;

    const enPattern = new RegExp(
      `^(${EN_TIME_WORDS.map(escapeRegExp).join("|")})\\s+${escapeRegExp(sport.en)}$`,
      "i",
    );
    if (enPattern.test(trimmed)) return sport;

    const frMatches = sport.frVariants.some((variant) =>
      new RegExp(`^${escapeRegExp(variant)}\\s+(${frTimeGroup})$`, "i").test(trimmed),
    );
    if (frMatches) return sport;
  }
  return null;
}

/** Vrai si `name` correspond au patron générique Strava (EN ou FR) pour `type`. */
export function isGenericActivityName(name: string, type: string): boolean {
  return matchGenericSport(name, type) !== null;
}

/**
 * Nom affiché : un libellé français dérivé du sport et de l'heure si `name`
 * est générique, sinon `name` tel quel (jamais touché s'il a été personnalisé).
 */
export function normalizeActivityName(name: string, type: string, localHour: number): string {
  const sport = matchGenericSport(name, type);
  if (!sport) return name;
  return `${sport.fr} ${frTimeOfDay(localHour)}`;
}
