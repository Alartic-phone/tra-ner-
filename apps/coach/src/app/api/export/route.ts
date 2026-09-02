import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth.ts";
import { collectExportData } from "@/lib/export/collect.ts";
import { exportScopeSchema, buildExportFilename } from "@/lib/export/scope.ts";
import { renderMarkdown } from "@/lib/export/markdown.ts";
import { renderJson } from "@/lib/export/json.ts";
import { renderCsvZip } from "@/lib/export/csv.ts";
import { assertNoSecrets } from "@/lib/export/security.ts";
import { today } from "@/lib/time.ts";

export const dynamic = "force-dynamic";

/**
 * Génère et renvoie le fichier d'export en téléchargement direct.
 *
 * POST plutôt que GET : la portée (sections cochées, activités sélectionnées
 * pour les flux) peut dépasser confortablement une longueur d'URL et n'a pas
 * vocation à être partageable ou mise en favori.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = exportScopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Portée d'export invalide", issues: parsed.error.issues }, { status: 400 });
  }
  const scope = parsed.data;

  const data = await collectExportData(scope);
  const filename = buildExportFilename(scope, today());

  if (scope.format === "markdown") {
    const content = renderMarkdown(data);
    assertNoSecrets(content);
    return fileResponse(content, filename, "text/markdown; charset=utf-8");
  }

  if (scope.format === "json") {
    const content = renderJson(data);
    assertNoSecrets(content);
    return fileResponse(content, filename, "application/json; charset=utf-8");
  }

  const zip = await renderCsvZip(data);
  return fileResponse(zip, filename, "application/zip");
}

function fileResponse(body: string | Buffer, filename: string, contentType: string) {
  return new NextResponse(body as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
