import { addDays, isValidDay, type Day } from "../shifts/day.ts";
import type { ExportScope } from "./gather.ts";

/** Résolution pure de la portée d'export en bornes de jours. */
export function resolvePeriod(
  scope: ExportScope,
  today: Day,
  custom?: { from?: string; to?: string },
): { from: Day; to: Day } | null {
  switch (scope) {
    case "7j":
      return { from: addDays(today, -6), to: today };
    case "30j":
      return { from: addDays(today, -29), to: today };
    case "90j":
      return { from: addDays(today, -89), to: today };
    case "tout":
      // Repli statique pour ce module resté pur : lib/export/build.ts
      // remplace cette borne par la date de la donnée la plus ancienne
      // réellement en base avant d'appeler gatherExportData — sans ça, la
      // section Postes énumérerait des décennies de jours vides.
      return { from: "2000-01-01", to: today };
    case "personnalise": {
      const from = custom?.from;
      const to = custom?.to ?? today;
      if (!from || !isValidDay(from) || !isValidDay(to) || from > to) return null;
      return { from, to };
    }
  }
}

/** Nom de fichier déterministe : coach-export-<AAAA-MM-JJ>-<portée>.<ext>. */
export function exportFileName(exportedAt: Day, scope: ExportScope, ext: string): string {
  return `coach-export-${exportedAt}-${scope}.${ext}`;
}
