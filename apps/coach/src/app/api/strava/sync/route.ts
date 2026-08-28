import { NextResponse, type NextRequest } from "next/server";
import { isAuthenticated } from "@/lib/auth.ts";
import { getEnv } from "@/lib/env.ts";
import { safeEqual } from "@/lib/crypto.ts";
import { enqueueIncrementalSync, getSyncStatus, runSyncWorker } from "@/lib/strava/sync.ts";

export const dynamic = "force-dynamic";

/**
 * Autorise soit une session utilisateur, soit une tâche planifiée porteuse du
 * secret partagé — c'est ce second chemin qu'emprunte le cron quotidien
 * lorsque l'application n'a pas d'URL publique et ne reçoit donc aucun
 * webhook Strava.
 */
async function authorize(request: NextRequest): Promise<boolean> {
  if (await isAuthenticated()) return true;
  const secret = getEnv().CRON_SECRET;
  const provided = request.headers.get("x-cron-secret");
  return Boolean(secret && provided && safeEqual(provided, secret));
}

/**
 * Déclenchement manuel de la synchronisation, et dépilage de la file.
 * Appelé par le bouton « Synchroniser » et par le script de cron quotidien.
 */
export async function POST(request: NextRequest) {
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
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
  if (!(await authorize(request))) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
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
