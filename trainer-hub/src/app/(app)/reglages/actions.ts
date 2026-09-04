"use server";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getEnv, isStravaConfigured } from "@/lib/env.ts";
import { buildAuthorizeUrl, disconnect } from "@/lib/strava/oauth.ts";
import {
  enqueueIncrementalSync,
  runSyncWorker,
  startBackfill,
  type WorkerReport,
} from "@/lib/strava/sync.ts";

const STATE_COOKIE = "strava_oauth_state";

/** Redirige vers l'écran de consentement Strava. */
export async function connectStrava(): Promise<void> {
  if (!isStravaConfigured()) redirect("/reglages?strava=non_configure");

  const env = getEnv();
  const state = randomBytes(24).toString("base64url");
  const store = await cookies();
  store.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // Strava nous renvoie depuis son domaine.
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });

  const base = env.PUBLIC_URL ?? "http://localhost:3000";
  redirect(buildAuthorizeUrl(state, `${base}/api/strava/callback`));
}

export async function disconnectStrava(): Promise<void> {
  await disconnect();
  revalidatePath("/reglages");
}

export type SyncResult =
  | { ok: true; report: WorkerReport }
  | { ok: false; error: string };

export async function syncNow(): Promise<SyncResult> {
  await enqueueIncrementalSync();
  const report = await runSyncWorker({ maxJobs: 40, budgetMs: 25_000 });
  revalidatePath("/reglages");
  revalidatePath("/activites");
  revalidatePath("/calendrier");
  return { ok: true, report };
}

/** Relance l'import complet de l'historique. */
export async function resumeBackfill(): Promise<SyncResult> {
  await startBackfill();
  const report = await runSyncWorker({ maxJobs: 40, budgetMs: 25_000 });
  revalidatePath("/reglages");
  return { ok: true, report };
}
