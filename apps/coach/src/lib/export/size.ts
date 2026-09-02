import type { ExportFormat } from "./scope.ts";
import type { ExportData } from "./schema.ts";
import { renderMarkdown } from "./markdown.ts";
import { renderJson } from "./json.ts";
import { buildCsvFiles } from "./csv.ts";

/**
 * Taille réelle du fichier — pas une estimation statistique. À l'échelle
 * d'un utilisateur unique (au plus quelques milliers d'activités), générer
 * le contenu pour le mesurer coûte quelques dizaines de millisecondes tout
 * au plus : mentir avec une formule approchée n'apporterait rien.
 *
 * Le CSV n'est pas compressé ici : la taille du .zip final dépend du taux de
 * compression, imprévisible avant coup. On affiche donc la taille des CSV
 * non compressés, en précisant que le fichier téléchargé (zippé) sera plus
 * léger — jamais un chiffre qui dépasse la réalité.
 */

export const MARKDOWN_CHAR_WARNING_THRESHOLD = 400_000;

export type ExportPreview = {
  format: ExportFormat;
  chars: number;
  bytes: number;
  /** Vrai uniquement pour le Markdown au-delà du seuil du cahier des charges. */
  warnTooLarge: boolean;
};

export function computeExportPreview(data: ExportData, format: ExportFormat): ExportPreview {
  if (format === "markdown") {
    const content = renderMarkdown(data);
    return {
      format,
      chars: content.length,
      bytes: Buffer.byteLength(content, "utf8"),
      warnTooLarge: content.length > MARKDOWN_CHAR_WARNING_THRESHOLD,
    };
  }

  if (format === "json") {
    const content = renderJson(data);
    return { format, chars: content.length, bytes: Buffer.byteLength(content, "utf8"), warnTooLarge: false };
  }

  const files = buildCsvFiles(data);
  const bytes = Object.values(files).reduce((sum, f) => sum + Buffer.byteLength(f, "utf8"), 0);
  const chars = Object.values(files).reduce((sum, f) => sum + f.length, 0);
  return { format, chars, bytes, warnTooLarge: false };
}
