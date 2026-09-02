import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth.ts";
import { collectExportData } from "@/lib/export/collect.ts";
import { exportScopeSchema } from "@/lib/export/scope.ts";
import { computeExportPreview } from "@/lib/export/size.ts";

export const dynamic = "force-dynamic";

/**
 * Taille réelle du fichier que produirait `/api/export` avec la même
 * portée — appelé par le formulaire avant tout téléchargement. Sépare la
 * mesure du téléchargement plutôt que d'ajouter un paramètre `?mode=size` à
 * la route de génération : deux intentions différentes, deux routes.
 */
export async function POST(request: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const body: unknown = await request.json().catch(() => null);
  const parsed = exportScopeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Portée d'export invalide" }, { status: 400 });
  }
  const scope = parsed.data;

  const data = await collectExportData(scope);
  const preview = computeExportPreview(data, scope.format);
  return NextResponse.json(preview);
}
