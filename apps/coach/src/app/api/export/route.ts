import { NextResponse, type NextRequest } from "next/server";
import { buildExportFile, type ExportFormat } from "@/lib/export/build.ts";
import type { ExportScope } from "@/lib/export/gather.ts";

export const dynamic = "force-dynamic";

const SCOPES: ExportScope[] = ["7j", "30j", "90j", "tout", "personnalise"];
const FORMATS: ExportFormat[] = ["md", "json", "csv"];
const DETAILS = ["aucune", "plus_45min", "toutes"] as const;

/**
 * Génère le fichier d'export côté serveur. GET, pas POST : le résultat est
 * une représentation (un fichier) d'une requête idempotente, pas une
 * modification — un lien direct fonctionne aussi, cf. bouton de
 * téléchargement de /analyses/export.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const scope = url.searchParams.get("scope") as ExportScope | null;
  const format = url.searchParams.get("format") as ExportFormat | null;
  const detail = (url.searchParams.get("detail") ?? "aucune") as (typeof DETAILS)[number];
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  if (!scope || !SCOPES.includes(scope)) {
    return NextResponse.json({ error: "Paramètre 'scope' invalide." }, { status: 400 });
  }
  if (!format || !FORMATS.includes(format)) {
    return NextResponse.json({ error: "Paramètre 'format' invalide." }, { status: 400 });
  }
  if (!DETAILS.includes(detail)) {
    return NextResponse.json({ error: "Paramètre 'detail' invalide." }, { status: 400 });
  }

  const result = await buildExportFile({ scope, format, activityDetail: detail, from, to });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const body = result.content instanceof Uint8Array ? Buffer.from(result.content) : result.content;
  return new NextResponse(body, {
    headers: {
      "Content-Type": result.contentType,
      "Content-Disposition": `attachment; filename="${result.filename}"`,
      // Export personnel généré à la demande : jamais mis en cache par un intermédiaire.
      "Cache-Control": "no-store",
    },
  });
}
