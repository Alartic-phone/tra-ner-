"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getEnv } from "@/lib/env.ts";
import { STATE_COOKIE, STATE_TTL_S, buildAuthorizeUrl, disconnect, generateOAuthState } from "@/lib/strava/oauth.ts";
import { getStravaCredentials, setStravaCredentials } from "@/lib/strava/credentials.ts";
import {
  enqueueIncrementalSync,
  runSyncWorker,
  startBackfill,
  type WorkerReport,
} from "@/lib/strava/sync.ts";

/** Redirige vers l'écran de consentement Strava. */
export async function connectStrava(): Promise<void> {
  const credentials = await getStravaCredentials();
  if (!credentials) redirect("/reglages?strava=non_configure");

  const env = getEnv();
  const { state, cookieValue } = generateOAuthState();
  const store = await cookies();
  store.set(STATE_COOKIE, cookieValue, {
    httpOnly: true,
    sameSite: "lax", // Strava nous renvoie depuis son domaine.
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge: STATE_TTL_S,
  });

  // `PUBLIC_URL` prime quand elle est configurée (déploiement). En local, où
  // elle est vide, dériver l'hôte de la requête entrante plutôt qu'une
  // constante codée en dur : le cookie ci-dessus est posé sur l'hôte
  // réellement visité (localhost, 127.0.0.1…) et Strava doit y revenir
  // exactement, sans quoi le cookie — sans attribut Domain, donc host-only —
  // n'est jamais renvoyé par le navigateur au retour.
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const proto = requestHeaders.get("x-forwarded-proto") ?? "http";
  const base = env.PUBLIC_URL ?? `${proto}://${host}`;
  redirect(buildAuthorizeUrl(credentials.clientId, state, `${base}/api/strava/callback`));
}

const credentialsFormSchema = z.object({
  clientId: z.string().trim().regex(/^\d+$/, "Le Client ID Strava est un nombre."),
  clientSecret: z.string().trim().min(20, "Le Client Secret Strava fait au moins 20 caractères."),
});

export type SaveCredentialsResult = { ok: true } | { ok: false; error: string };

/** Enregistre les identifiants Strava saisis dans Réglages (chiffrés en base). */
export async function saveStravaCredentials(formData: FormData): Promise<SaveCredentialsResult> {
  const parsed = credentialsFormSchema.safeParse({
    clientId: formData.get("clientId"),
    clientSecret: formData.get("clientSecret"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Identifiants invalides." };
  }
  await setStravaCredentials(parsed.data.clientId, parsed.data.clientSecret);
  revalidatePath("/reglages");
  return { ok: true };
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
