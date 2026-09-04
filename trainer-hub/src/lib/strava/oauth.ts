import { prisma } from "../db.ts";
import { encrypt } from "../crypto.ts";
import { getEnv } from "../env.ts";
import { tokenResponseSchema } from "./schemas.ts";

/**
 * OAuth 2.0 Strava.
 *
 * Portée demandée : `read` (profil public), `activity:read_all` (y compris les
 * activités privées — sans quoi une sortie marquée privée serait absente de la
 * charge d'entraînement) et `profile:read_all`.
 */
export const STRAVA_SCOPES = "read,activity:read_all,profile:read_all";

export function buildAuthorizeUrl(state: string, redirectUri: string): string {
  const env = getEnv();
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", env.STRAVA_CLIENT_ID ?? "");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  // `force` garantit que Strava réaffiche l'écran de consentement si les
  // portées ont changé depuis la dernière connexion.
  url.searchParams.set("approval_prompt", "force");
  url.searchParams.set("scope", STRAVA_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(code: string): Promise<void> {
  const env = getEnv();
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    throw new Error(`Échange du code Strava refusé (${response.status}).`);
  }

  const token = tokenResponseSchema.parse(await response.json());
  const athleteName = [token.athlete?.firstname, token.athlete?.lastname]
    .filter(Boolean)
    .join(" ");

  // Les jetons ne sont jamais stockés en clair : AES-256-GCM avec la clé
  // d'application.
  const data = {
    athleteId: BigInt(token.athlete?.id ?? 0),
    accessTokenEnc: encrypt(token.access_token),
    refreshTokenEnc: encrypt(token.refresh_token),
    expiresAt: new Date(token.expires_at * 1000),
    scope: token.scope ?? STRAVA_SCOPES,
    athleteName: athleteName || null,
  };

  await prisma.stravaAccount.upsert({
    where: { id: "strava" },
    create: { id: "strava", ...data },
    update: data,
  });
}

export async function disconnect(): Promise<void> {
  await prisma.stravaAccount.deleteMany({});
  await prisma.syncJob.deleteMany({ where: { status: { in: ["pending", "failed"] } } });
}
