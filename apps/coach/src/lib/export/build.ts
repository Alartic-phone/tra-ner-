import { gatherExportData, type ExportScope } from "./gather.ts";
import { buildMarkdownExport } from "./markdown.ts";
import { buildActivitiesCsv, buildHealthCsv, buildSplitsCsv, buildWeeksCsv } from "./csv.ts";
import { buildZip } from "./zip.ts";
import { exportFileName, resolvePeriod } from "./period.ts";
import { exportDataSchema } from "./schema.ts";
import { assertNoSecrets } from "./security.ts";
import { prisma } from "../db.ts";
import { addDays, minDay } from "../shifts/day.ts";
import { today as todayFn } from "../time.ts";
import type { Day } from "../shifts/day.ts";

/**
 * Borne basse de la portée "tout" : la plus ancienne donnée RÉELLE (activité
 * ou mesure de santé), pas une date arbitraire — sans ça, la section Postes
 * énumérerait des milliers de jours avant le début du suivi (repéré en
 * pratique : ~1,7 M caractères pour une seule activité de test).
 */
async function resolveAllTimeFrom(today: Day): Promise<Day> {
  const [firstActivity, firstHealth] = await Promise.all([
    prisma.activity.findFirst({ orderBy: { startDay: "asc" }, select: { startDay: true } }),
    prisma.healthMetric.findFirst({ orderBy: { day: "asc" }, select: { day: true } }),
  ]);
  const candidates = [firstActivity?.startDay, firstHealth?.day].filter((d): d is Day => d != null);
  if (candidates.length === 0) return addDays(today, -365);
  return candidates.reduce((a, b) => minDay(a, b));
}

export type ExportFormat = "md" | "json" | "csv";

export type BuiltExport = { filename: string; content: string | Uint8Array; contentType: string; charCount: number };

/**
 * Point d'entrée UNIQUE des trois formats — utilisé à la fois par
 * /api/export et par `npm run export`, pour que les deux produisent
 * exactement le même fichier (consigne de la refonte).
 */
export async function buildExportFile(input: {
  scope: ExportScope;
  format: ExportFormat;
  activityDetail: "aucune" | "plus_45min" | "toutes";
  from?: string;
  to?: string;
  today?: Day;
}): Promise<BuiltExport | { error: string }> {
  const today = input.today ?? todayFn();
  const allTimeFrom = input.scope === "tout" ? await resolveAllTimeFrom(today) : undefined;
  const period =
    input.scope === "tout"
      ? { from: allTimeFrom!, to: today }
      : resolvePeriod(input.scope, today, { from: input.from, to: input.to });
  if (!period) return { error: "Période invalide (vérifier les dates de la plage personnalisée)." };

  const data = await gatherExportData({
    from: period.from,
    to: period.to,
    scope: input.scope,
    activityDetail: input.activityDetail,
  });

  if (input.format === "md") {
    const content = buildMarkdownExport(data);
    assertNoSecrets(content);
    return {
      filename: exportFileName(data.meta.exportedAt, input.scope, "md"),
      content,
      contentType: "text/markdown; charset=utf-8",
      charCount: content.length,
    };
  }

  if (input.format === "json") {
    const content = JSON.stringify(exportDataSchema.parse(data), null, 2);
    assertNoSecrets(content);
    return {
      filename: exportFileName(data.meta.exportedAt, input.scope, "json"),
      content,
      contentType: "application/json; charset=utf-8",
      charCount: content.length,
    };
  }

  const csvFiles = [
    { name: "activites.csv", content: buildActivitiesCsv(data) },
    { name: "sante.csv", content: buildHealthCsv(data) },
    { name: "semaines.csv", content: buildWeeksCsv(data) },
    { name: "splits.csv", content: buildSplitsCsv(data) },
  ];
  for (const file of csvFiles) assertNoSecrets(file.content);
  const zip = buildZip(csvFiles);
  return {
    filename: exportFileName(data.meta.exportedAt, input.scope, "zip"),
    content: zip,
    contentType: "application/zip",
    charCount: zip.length,
  };
}
