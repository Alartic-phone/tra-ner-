import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { safeEqual } from "@/lib/crypto.ts";
import { exchangeCode } from "@/lib/strava/oauth.ts";
import { startBackfill } from "@/lib/strava/sync.ts";

export const dynamic = "force-dynamic";

const STATE_COOKIE = "strava_oauth_state";

/** Retour d'autorisation Strava. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const error = searchParams.get("error");
  if (error) {
    return NextResponse.redirect(
      new URL(`/reglages?strava=refus&detail=${encodeURIComponent(error)}`, request.url),
    );
  }

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const store = await cookies();
  const expected = store.get(STATE_COOKIE)?.value;

  // Protection CSRF : l'état renvoyé par Strava doit correspondre à celui
  // déposé au moment de la redirection.
  if (!code || !state || !expected || !safeEqual(state, expected)) {
    return NextResponse.redirect(new URL("/reglages?strava=etat_invalide", request.url));
  }
  store.delete(STATE_COOKIE);

  const scope = searchParams.get("scope") ?? "";
  if (!scope.includes("activity:read_all")) {
    return NextResponse.redirect(
      new URL("/reglages?strava=portee_insuffisante", request.url),
    );
  }

  try {
    await exchangeCode(code);
    // Lance l'import de l'historique en tâche de fond : la file est persistée,
    // elle sera dépilée par le bouton de synchronisation et par le cron.
    await startBackfill();
  } catch (e) {
    const detail = e instanceof Error ? e.message : "inconnue";
    return NextResponse.redirect(
      new URL(`/reglages?strava=echec&detail=${encodeURIComponent(detail)}`, request.url),
    );
  }

  return NextResponse.redirect(new URL("/reglages?strava=connecte", request.url));
}
