import { NextResponse, type NextRequest } from "next/server";
import { getEnv, isWebhookCapable } from "@/lib/env.ts";
import { prisma } from "@/lib/db.ts";
import { webhookEventSchema } from "@/lib/strava/schemas.ts";
import { deleteActivity, enqueueActivity, runSyncWorker } from "@/lib/strava/sync.ts";

export const dynamic = "force-dynamic";

/**
 * Webhook Strava — synchronisation en temps réel quand l'application est
 * joignable depuis Internet. Sans URL publique, ce point d'entrée n'est jamais
 * appelé et la synchronisation se fait par le bouton et le cron : les deux
 * chemins coexistent, aucune bascule de code n'est nécessaire.
 */

/** Validation initiale de l'abonnement par Strava. */
export function GET(request: NextRequest) {
  const env = getEnv();
  const { searchParams } = request.nextUrl;

  if (
    searchParams.get("hub.mode") === "subscribe" &&
    env.STRAVA_WEBHOOK_VERIFY_TOKEN &&
    searchParams.get("hub.verify_token") === env.STRAVA_WEBHOOK_VERIFY_TOKEN
  ) {
    return NextResponse.json({ "hub.challenge": searchParams.get("hub.challenge") });
  }
  return new NextResponse("Jeton de vérification invalide", { status: 403 });
}

export async function POST(request: NextRequest) {
  if (!isWebhookCapable()) {
    return new NextResponse("Webhook non configuré", { status: 404 });
  }

  const parsed = webhookEventSchema.safeParse(await request.json());
  // Strava attend un 200 rapide : un événement mal formé est ignoré, pas
  // réessayé indéfiniment.
  if (!parsed.success) return NextResponse.json({ ok: true });

  const event = parsed.data;
  if (event.object_type !== "activity") return NextResponse.json({ ok: true });

  // L'événement doit concerner le compte connecté.
  const account = await prisma.stravaAccount.findFirst();
  if (!account || account.athleteId !== BigInt(event.owner_id)) {
    return NextResponse.json({ ok: true });
  }

  if (event.aspect_type === "delete") {
    await deleteActivity(event.object_id);
  } else {
    await enqueueActivity(event.object_id);
    // Dépilage immédiat mais borné : Strava coupe au-delà de deux secondes.
    void runSyncWorker({ maxJobs: 2, budgetMs: 1500 });
  }

  return NextResponse.json({ ok: true });
}
