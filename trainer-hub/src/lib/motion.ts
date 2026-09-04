import type { Transition } from "framer-motion";

/**
 * Durées et easings Framer Motion centralisés — tout composant animé importe
 * d'ici plutôt que d'inventer ses propres chiffres. --duration-fast/base/slow
 * et --ease-standard (globals.css) sont le miroir CSS pour les composants
 * sans JS (ProgressRing, keyframes) ; les deux jeux de valeurs doivent rester
 * synchronisés à la main, il n'y a pas de pont automatique entre CSS custom
 * properties et objets Framer Motion.
 *
 * Règle de mise en scène : une seule animation par écran a le droit d'être
 * remarquée (ex. un record personnel qui apparaît). Toutes les autres
 * transitions restent sous le seuil de perception consciente — si on la
 * remarque, elle est probablement trop lente ou trop grande.
 */

export const DURATION = {
  /** Micro-interactions : tap, hover, ouverture d'un badge. */
  fast: 0.15,
  /** Transitions standard : apparition de carte, changement de section. */
  base: 0.25,
  /** Entrées de page, listes échelonnées. */
  slow: 0.4,
} as const;

/** Même courbe que --ease-standard côté CSS. */
export const EASE = {
  standard: [0.4, 0, 0.2, 1],
  /** Sortie franche, pour ce qui entre à l'écran. */
  out: [0, 0, 0.2, 1],
  /** Entrée franche, pour ce qui quitte l'écran. */
  in: [0.4, 0, 1, 1],
} as const;

export const TRANSITION = {
  fast: { duration: DURATION.fast, ease: EASE.standard },
  base: { duration: DURATION.base, ease: EASE.standard },
  slow: { duration: DURATION.slow, ease: EASE.standard },
  /**
   * Réservé au moment qui a le droit d'être remarqué : un record personnel,
   * un objectif de plan atteint. Rebond visible mais bref — jamais pour une
   * transition ordinaire, sous peine de banaliser l'effet.
   */
  record: { type: "spring", stiffness: 380, damping: 20, mass: 0.6 },
} satisfies Record<"fast" | "base" | "slow" | "record", Transition>;
