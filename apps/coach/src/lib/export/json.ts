import { exportDataSchema, type ExportData } from "./schema.ts";

/**
 * Rendu JSON. Revalide contre `exportDataSchema` avant de sérialiser : un
 * export corrompu ne doit jamais atteindre un fichier — mieux vaut une
 * exception explicite ici qu'un JSON silencieusement invalide côté script
 * qui le relit.
 *
 * L'ordre des clés d'un objet JavaScript littéral est stable (ordre
 * d'insertion pour les clés non numériques) : `JSON.stringify` sur un objet
 * construit toujours dans le même ordre par `collect.ts` produit donc une
 * sortie déterministe sans tri explicite.
 */
export function renderJson(data: ExportData): string {
  const validated = exportDataSchema.parse(data);
  return JSON.stringify(validated, null, 2);
}
