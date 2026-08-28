import type { ShiftCycle, ShiftTiming } from "./types.ts";

/**
 * Valeurs de départ proposées à l'onboarding.
 *
 * Ce ne sont QUE des valeurs d'amorçage écrites en base au premier lancement :
 * l'application lit ensuite toujours la définition stockée (ShiftPattern /
 * ShiftCode), jamais ces constantes. Modifier son cycle depuis les réglages
 * n'exige donc aucun changement de code.
 */

/**
 * Cycle de référence : 49 jours, soit exactement 7 semaines. Le cycle se
 * répétant sur un multiple de 7, il retombe à l'identique sur les mêmes jours
 * de la semaine — ce qui rend le planning parfaitement prévisible.
 *
 * Bloc 1 : M M A A A N N puis 9 jours de repos  (16 j)
 * Bloc 2 : M M M A A N N puis 10 jours de repos (17 j)
 * Bloc 3 : M M A A N N N puis 9 jours de repos  (16 j)
 */
export const DEFAULT_SHIFT_CYCLE: ShiftCycle = {
  anchorDay: "2026-08-26", // mercredi, premier jour du bloc 1
  blocks: [
    { sequence: "MMAAANN", restDays: 9 },
    { sequence: "MMMAANN", restDays: 10 },
    { sequence: "MMAANNN", restDays: 9 },
  ],
};

/**
 * Horaires par défaut d'un 3x8. À vérifier et corriger dans les réglages :
 * la durée du créneau d'entraînement disponible en dépend directement.
 */
export const DEFAULT_SHIFT_TIMINGS: ShiftTiming[] = [
  {
    code: "M",
    label: "Matin",
    startTime: "05:00",
    endTime: "13:00",
    isWork: true,
    color: "#f59e0b",
  },
  {
    code: "A",
    label: "Après-midi",
    startTime: "13:00",
    endTime: "21:00",
    isWork: true,
    color: "#3b82f6",
  },
  {
    code: "N",
    label: "Nuit",
    startTime: "21:00",
    endTime: "05:00",
    isWork: true,
    color: "#7c3aed",
  },
  {
    code: "C",
    label: "Congé",
    startTime: "00:00",
    endTime: "00:00",
    isWork: false,
    color: "#10b981",
  },
];
