"use server";

import { isAuthenticated } from "@/lib/auth.ts";
import { buildExportFile, type ExportFormat } from "@/lib/export/build.ts";
import type { ExportScope } from "@/lib/export/gather.ts";

const MARKDOWN_SIZE_WARNING = 400_000;

export type ExportPreview =
  | { ok: true; filename: string; charCount: number; tooLarge: boolean }
  | { ok: false; error: string };

/**
 * Taille réelle (pas une estimation) avant de proposer le téléchargement —
 * générer un export coûte peu à l'échelle d'un historique personnel, autant
 * donner un chiffre exact plutôt qu'approché.
 */
export async function previewExport(input: {
  scope: ExportScope;
  format: ExportFormat;
  detail: "aucune" | "plus_45min" | "toutes";
  from?: string;
  to?: string;
}): Promise<ExportPreview> {
  if (!(await isAuthenticated())) return { ok: false, error: "Session expirée." };

  const result = await buildExportFile({
    scope: input.scope,
    format: input.format,
    activityDetail: input.detail,
    from: input.from,
    to: input.to,
  });
  if ("error" in result) return { ok: false, error: result.error };

  return {
    ok: true,
    filename: result.filename,
    charCount: result.charCount,
    tooLarge: input.format === "md" && result.charCount > MARKDOWN_SIZE_WARNING,
  };
}
