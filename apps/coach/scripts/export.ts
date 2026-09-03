/**
 * Équivalent en ligne de commande de /analyses/export — appelle exactement
 * le même point d'entrée (lib/export/build.ts) que l'API, pour produire
 * strictement le même fichier hors interface.
 *
 *   npm run export -- --format md --since 2026-08-01 --out ./export.md
 *   npm run export -- --format json --scope 90j --out ./export.json
 *   npm run export -- --format csv --scope tout --out ./export.zip
 */
for (const file of [".env", ".env.local"]) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Fichier absent : ignoré, comme les autres scripts du dossier.
  }
}

import { writeFileSync } from "node:fs";
import { buildExportFile, type ExportFormat } from "../src/lib/export/build.ts";
import type { ExportScope } from "../src/lib/export/gather.ts";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg?.startsWith("--")) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value && !value.startsWith("--")) {
        out[key] = value;
        i++;
      } else {
        out[key] = "true";
      }
    }
  }
  return out;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const format = (args.format ?? "md") as ExportFormat;
  if (!["md", "json", "csv"].includes(format)) {
    console.error(`Format invalide : ${format} (attendu md, json ou csv)`);
    process.exitCode = 1;
    return;
  }

  const detail = (args.detail ?? "aucune") as "aucune" | "plus_45min" | "toutes";
  const scope = (args.scope ?? (args.since ? "personnalise" : "30j")) as ExportScope;

  const result = await buildExportFile({
    scope,
    format,
    activityDetail: detail,
    from: args.since,
    to: args.until,
  });

  if ("error" in result) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }

  const outPath = args.out ?? result.filename;
  writeFileSync(outPath, result.content);
  console.log(`Écrit : ${outPath} (${result.charCount} caractères/octets).`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
