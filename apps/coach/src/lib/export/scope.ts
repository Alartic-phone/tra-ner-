import { z } from "zod";
import { addDays, isValidDay } from "../shifts/day.ts";
import { today } from "../time.ts";
import type { Day } from "../shifts/day.ts";

/**
 * Portée d'un export : ce que l'utilisateur choisit dans le formulaire (ou
 * passe en ligne de commande). Séparé du schéma des données produites
 * (`schema.ts`) : ceci décrit une intention, pas un résultat.
 */

const dayString = z.string().refine(isValidDay, "Jour attendu au format AAAA-MM-JJ");

export const EXPORT_PERIOD_PRESETS = ["7", "30", "90", "all", "custom"] as const;
export type ExportPeriodPreset = (typeof EXPORT_PERIOD_PRESETS)[number];

export const EXPORT_ACTIVITY_DETAIL = ["none", "long", "all"] as const;
export type ExportActivityDetail = (typeof EXPORT_ACTIVITY_DETAIL)[number];

export const EXPORT_FORMATS = ["markdown", "json", "csv"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const exportSectionsSchema = z.object({
  profile: z.boolean(),
  shifts: z.boolean(),
  weeks: z.boolean(),
  activities: z.boolean(),
  health: z.boolean(),
  records: z.boolean(),
  plan: z.boolean(),
  quality: z.boolean(),
});
export type ExportSections = z.infer<typeof exportSectionsSchema>;

export const ALL_SECTIONS: ExportSections = {
  profile: true,
  shifts: true,
  weeks: true,
  activities: true,
  health: true,
  records: true,
  plan: true,
  quality: true,
};

export const exportScopeSchema = z
  .object({
    periodPreset: z.enum(EXPORT_PERIOD_PRESETS).default("90"),
    /** Utilisés seulement quand periodPreset === "custom". */
    customFrom: dayString.optional(),
    customTo: dayString.optional(),

    sections: exportSectionsSchema,
    activityDetail: z.enum(EXPORT_ACTIVITY_DETAIL).default("none"),
    format: z.enum(EXPORT_FORMATS).default("markdown"),

    /**
     * Flux seconde par seconde : uniquement en JSON, décoché par défaut, et
     * seulement pour les activités listées ici explicitement — jamais un
     * "toutes" implicite qui ferait exploser le fichier.
     */
    includeStreams: z.boolean().default(false),
    streamActivityIds: z.array(z.string()).default([]),
  })
  .transform((v) => ({
    ...v,
    // Les flux ne veulent rien dire hors JSON, et sans sélection.
    includeStreams: v.format === "json" && v.includeStreams && v.streamActivityIds.length > 0,
  }));

export type ExportScope = z.infer<typeof exportScopeSchema>;

/** Résout la période effective (bornes incluses) à partir du préréglage. */
export function resolvePeriod(scope: Pick<ExportScope, "periodPreset" | "customFrom" | "customTo">): {
  from: Day;
  to: Day;
} {
  const now = today();
  if (scope.periodPreset === "all") return { from: "2000-01-01", to: now };
  if (scope.periodPreset === "custom") {
    const to = scope.customTo && isValidDay(scope.customTo) ? scope.customTo : now;
    const from = scope.customFrom && isValidDay(scope.customFrom) ? scope.customFrom : addDays(to, -90);
    return from <= to ? { from, to } : { from: to, to: from };
  }
  const days = Number(scope.periodPreset);
  return { from: addDays(now, -(days - 1)), to: now };
}

export type ExportPreset = {
  id: "bilan_semaine" | "dossier_complet" | "brut_json";
  label: string;
  description: string;
  scope: Omit<ExportScope, "includeStreams"> & { includeStreams?: boolean };
};

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: "bilan_semaine",
    label: "Bilan de la semaine",
    description: "7 derniers jours, Markdown, sans le détail seconde par seconde.",
    scope: {
      periodPreset: "7",
      sections: ALL_SECTIONS,
      activityDetail: "long",
      format: "markdown",
      streamActivityIds: [],
    },
  },
  {
    id: "dossier_complet",
    label: "Dossier complet",
    description: "Tout l'historique, Markdown, détail de toutes les activités.",
    scope: {
      periodPreset: "all",
      sections: ALL_SECTIONS,
      activityDetail: "all",
      format: "markdown",
      streamActivityIds: [],
    },
  },
  {
    id: "brut_json",
    label: "Brut (JSON)",
    description: "Tout l'historique, JSON structuré, pour réimport ou script.",
    scope: {
      periodPreset: "all",
      sections: ALL_SECTIONS,
      activityDetail: "all",
      format: "json",
      streamActivityIds: [],
    },
  },
];

/** Nom de fichier déterministe : `coach-export-<date>-<portée>.<ext>`. */
export function buildExportFilename(
  scope: Pick<ExportScope, "periodPreset" | "format">,
  exportedOn: Day,
): string {
  const ext = scope.format === "markdown" ? "md" : scope.format === "json" ? "json" : "zip";
  const portee = scope.periodPreset === "all" ? "tout" : `${scope.periodPreset}j`;
  return `coach-export-${exportedOn}-${portee}.${ext}`;
}
