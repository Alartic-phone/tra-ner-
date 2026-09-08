import { randomBytes } from "node:crypto";
import { prisma } from "../db.ts";
import { decrypt, encrypt, safeEqual } from "../crypto.ts";
import { tokenResponseSchema } from "./schemas.ts";
import type { StravaCredentials } from "./credentials.ts";

/**
 * OAuth 2.0 Strava.
 *
 * Portée demandée : `read` (profil public), `activity:read_all` (y compris les
 * activités privées — sans quoi une sortie marquée privée serait absente de la
 * charge d'entraînement) et `profile:read_all`.
 */
export const STRAVA_SCOPES = "read,activity:read_all,profile:read_all";

/**
 * Protection CSRF de l'aller-retour OAuth (indépendante de toute notion de
 * session utilisateur — l'app n'en a plus depuis le retrait de
 * l'authentification, et ce cookie n'en a d'ailleurs jamais dépendu).
 *
 * La valeur posée en cookie est l'état aléatoire chiffré (AES-256-GCM,
 * authentifié) plutôt que l'état en clair : un cookie modifié ou rejoué
 * depuis une autre origine échoue au déchiffrement, sans quoi une simple
 * égalité sur une valeur en clair suffirait à un attaquant qui parviendrait
 * à déposer son propre cookie (« cookie tossing ») sur le même navigateur.
 */
export const STATE_COOKIE = "strava_oauth_state";
export const STATE_TTL_S = 600;

export function generateOAuthState(): { state: string; cookieValue: string } {
  const state = randomBytes(24).toString("base64url");
  return { state, cookieValue: encrypt(state) };
}

/** Vrai seulement si le cookie est présent, déchiffrable, et égal en temps
 * constant à l'état renvoyé par Strava. Toute anomalie (cookie absent, state
 * absent, cookie altéré ou rejoué depuis une autre origine) renvoie faux —
 * jamais une exception qui laisserait deviner la cause à un attaquant. */
export function verifyOAuthState(cookieValue: string | undefined, returnedState: string | null): boolean {
  if (!cookieValue || !returnedState) return false;
  let expected: string;
  try {
    expected = decrypt(cookieValue);
  } catch {
    return false;
  }
  return safeEqual(returnedState, expected);
}

export function buildAuthorizeUrl(clientId: string, state: string, redirectUri: string): string {
  const url = new URL("https://www.strava.com/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  // `force` garantit que Strava réaffiche l'écran de consentement si les
  // portées ont changé depuis la dernière connexion.
  url.searchParams.set("approval_prompt", "force");
  url.searchParams.set("scope", STRAVA_SCOPES);
  url.searchParams.set("state", state);
  return url.toString();
}

export async function exchangeCode(credentials: StravaCredentials, code: string): Promise<void> {
  const response = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
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
