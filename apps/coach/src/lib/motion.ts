import type { Transition } from "framer-motion";

/**
 * Durées, courbes et ressorts Framer Motion centralisés — tout composant
 * animé importe d'ici plutôt que d'inventer ses propres chiffres. Le miroir
 * CSS (--duration-fast/base/slow, --ease-standard dans globals.css) sert aux
 * composants sans JS ; les deux jeux de valeurs se synchronisent à la main,
 * il n'y a pas de pont automatique entre custom properties CSS et objets
 * Framer Motion.
 *
 * Règle de composition : UNE animation remarquable par écran, les autres
 * invisibles. L'ambition va dans la qualité d'exécution de ces quelques
 * moments, pas dans leur nombre — une app qui bouge partout est fatigante à
 * 5 h du matin.
 *
 * `useReducedMotion` (Framer Motion) court-circuite toujours : l'état final
 * s'affiche immédiatement. Il ne ralentit jamais une animation, il la
 * supprime.
 */

export const DUR = {
  /** Micro-interactions : tap, hover, ouverture d'un badge. */
  fast: 0.15,
  /** Transitions standard : apparition de carte, changement de section. */
  base: 0.25,
  /** Entrées de page, listes échelonnées. */
  slow: 0.4,
  /** Tracé qui se dessine (page activité, carte GPS) — lent et délibéré. */
  draw: 1.2,
} as const;

export const EASE = {
  /** Sortie franche, pour ce qui entre à l'écran. */
  out: [0.16, 1, 0.3, 1],
  /** Entrée et sortie symétriques, pour ce qui reste à l'écran (curseurs, toggles). */
  inOut: [0.65, 0, 0.35, 1],
} as const;

/**
 * Réservé au moment qui a le droit d'être remarqué : un record personnel qui
 * apparaît, une marche de <RecordStaircase /> qui monte. Jamais pour une
 * transition ordinaire, sous peine de banaliser l'effet.
 */
export const SPRING_RECORD: Transition = {
  type: "spring",
  stiffness: 260,
  damping: 20,
};

/** Délai entre deux éléments d'une entrée échelonnée, en secondes. */
export const STAGGER = 0.06;
