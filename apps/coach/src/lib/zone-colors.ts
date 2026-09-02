/**
 * Rampe des 5 zones FC, partagée par tous les composants qui colorent une
 * intensité (barre de zone, graphique de répartition, courbe FC). Isolée
 * dans un module SANS "use client" à dessein : un composant serveur (page
 * activité, fil d'activités) qui importerait cette constante depuis un
 * fichier "use client" la recevrait `undefined` — la frontière client React
 * n'exporte fiablement que des composants, pas de données brutes.
 */
export const ZONE_RAMP = [
  "var(--zone-1)",
  "var(--zone-2)",
  "var(--zone-3)",
  "var(--zone-4)",
  "var(--zone-5)",
];
