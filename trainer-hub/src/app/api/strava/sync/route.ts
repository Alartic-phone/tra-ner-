import { NextResponse, type NextRequest } from "next/server";
import { getEnv } from "@/lib/env.ts";
import { safeEqual } from "@/lib/crypto.ts";
import { enqueueIncrementalSync, getSyncStatus, runSyncWorker } from "@/lib/strava/sync.ts";

export const dynamic = "force-dynamic";

/**
 * Application sans authentification : n'importe quel appel direct est
 * autorisé. Le seul cas où une vérification garde un sens est la tâche
 * planifiée, qui porte un secret partagé dans `x-cron-secret` — s'il est
 * présent, il doit être exact, faute de quoi l'appel est rejeté plutôt que
 * silencieusement ignoré.
 */
function authorize(request: NextRequest): boolean {
  const provided = request.headers.get("x-cron-secret");
  if (!provided) return true;
  const secret = getEnv().CRON_SECRET;
  return Boolean(secret && safeEqual(provided, secret));
}

/**
 * Déclenchement manuel de la synchronisation, et dépilage de la file.
 * Appelé par le bouton « Synchroniser » et par le script de cron quotidien.
 */
export async function POST(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Secret de tâche planifiée invalide" }, { status: 401 });
  }

  await enqueueIncrementalSync();
  const report = await runSyncWorker({ maxJobs: 40, budgetMs: 25_000 });
  const status = await getSyncStatus();

  return NextResponse.json({
    report,
    pending: status.pending,
    failed: status.failed,
    activities: status.activities,
  });
}

export async function GET(request: NextRequest) {
  if (!authorize(request)) {
    return NextResponse.json({ error: "Secret de tâche planifiée invalide" }, { status: 401 });
  }
  const status = await getSyncStatus();
  return NextResponse.json({
    connected: Boolean(status.account),
    pending: status.pending,
    running: status.running,
    failed: status.failed,
    activities: status.activities,
    withStreams: status.withStreams,
    backfillDone: status.account?.backfillDone ?? false,
    lastSyncAt: status.account?.lastSyncAt ?? null,
  });
}
