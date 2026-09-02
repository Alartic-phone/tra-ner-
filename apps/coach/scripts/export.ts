/**
 * Export du dossier d'entraînement en ligne de commande.
 *
 * Appelle exactement les mêmes fonctions (`collectExportData`, les
 * renderers de `lib/export/`) que la route `/api/export` : aucune logique
 * dupliquée entre le formulaire et le script, donc aucune divergence
 * possible entre les deux fichiers produits pour la même portée.
 *
 *   npm run export -- --format md --since 2026-08-01 --out ./export.md
 *   npm run export -- --format json --since 2026-01-01 --until 2026-06-30 --out ./export.json
 *   npm run export -- --format csv --out ./export.zip
 */
process.loadEnvFile();

import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { collectExportData } from "../src/lib/export/collect.ts";
import { ALL_SECTIONS, exportScopeSchema, type ExportFormat } from "../src/lib/export/scope.ts";
import { renderMarkdown } from "../src/lib/export/markdown.ts";
import { renderJson } from "../src/lib/export/json.ts";
import { renderCsvZip } from "../src/lib/export/csv.ts";
import { assertNoSecrets } from "../src/lib/export/security.ts";
import { isValidDay } from "../src/lib/shifts/day.ts";
import { today } from "../src/lib/time.ts";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg?.startsWith("--")) continue;
    const key = arg.slice(2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Valeur manquante pour --${key}`);
    }
    out[key] = value;
    i++;
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const format = (args.format ?? "md") as "md" | ExportFormat;
  const formatMap: Record<string, ExportFormat> = { md: "markdown", markdown: "markdown", json: "json", csv: "csv" };
  const resolvedFormat = formatMap[format];
  if (!resolvedFormat) {
    throw new Error(`--format invalide : "${format}" (attendu md, json ou csv)`);
  }

  if (!args.out) throw new Error("--out est requis (chemin du fichier de sortie)");

  const since = args.since;
  const until = args.until ?? today();
  if (since && !isValidDay(since)) throw new Error(`--since invalide : "${since}" (attendu AAAA-MM-JJ)`);
  if (!isValidDay(until)) throw new Error(`--until invalide : "${until}" (attendu AAAA-MM-JJ)`);

  const detail = (args.detail ?? "long") as "none" | "long" | "all";

  const scope = exportScopeSchema.parse({
    periodPreset: since ? "custom" : "all",
    customFrom: since,
    customTo: since ? until : undefined,
    sections: ALL_SECTIONS,
    activityDetail: detail,
    format: resolvedFormat,
    includeStreams: false,
    streamActivityIds: [],
  });

  const data = await collectExportData(scope);

  const target = resolve(args.out);

  if (scope.format === "markdown") {
    const content = renderMarkdown(data);
    assertNoSecrets(content);
    writeFileSync(target, content, "utf8");
  } else if (scope.format === "json") {
    const content = renderJson(data);
    assertNoSecrets(content);
    writeFileSync(target, content, "utf8");
  } else {
    const zip = await renderCsvZip(data);
    writeFileSync(target, zip);
  }

  console.log(`Export écrit : ${target} (${data.metadata.counts.activities} activités, ${data.metadata.period.from} → ${data.metadata.period.to})`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
