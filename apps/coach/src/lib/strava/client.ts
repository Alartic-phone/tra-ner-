import { z } from "zod";
import { prisma } from "../db.ts";
import { decrypt, encrypt } from "../crypto.ts";
import { getStravaCredentials } from "./credentials.ts";
import { streamSetSchema, tokenResponseSchema, STREAM_KEYS } from "./schemas.ts";

const API = "https://www.strava.com/api/v3";
const TOKEN_URL = "https://www.strava.com/oauth/token";

/**
 * Client Strava.
 *
 * Deux points sensibles y sont traités :
 *
 *  1. Le jeton d'accès expire toutes les six heures. Il est rafraîchi de façon
 *     préemptive (marge de cinq minutes) plutôt qu'après un 401, pour ne pas
 *     gaspiller une requête du quota à chaque expiration.
 *
 *  2. Le quota est lu dans les en-têtes de réponse au lieu d'être supposé.
 *     Strava applique une limite courte (15 minutes) et une limite
 *     quotidienne, dont les valeurs diffèrent selon l'ancienneté de
 *     l'application — les anciennes ont 200/2 000, les récentes 100/1 000.
 *     Se fier aux en-têtes évite de coder en dur un quota qui n'est pas le bon.
 */

export class StravaRateLimitError extends Error {
  constructor(
    message: string,
    /** Secondes à attendre avant de réessayer. */
    readonly retryAfterS: number,
  ) {
    super(message);
    this.name = "StravaRateLimitError";
  }
}

export class StravaAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StravaAuthError";
  }
}

export type RateLimitState = {
  shortTermUsage: number;
  shortTermLimit: number;
  dailyUsage: number;
  dailyLimit: number;
};

let lastRateLimit: RateLimitState | null = null;

export function getLastRateLimit(): RateLimitState | null {
  return lastRateLimit;
}

function parseRateLimit(headers: Headers): void {
  // Strava expose les compteurs de lecture séparément des compteurs globaux ;
  // on privilégie les compteurs de lecture, seuls concernés ici.
  const limit = headers.get("x-readratelimit-limit") ?? headers.get("x-ratelimit-limit");
  const usage = headers.get("x-readratelimit-usage") ?? headers.get("x-ratelimit-usage");
  if (!limit || !usage) return;

  const [shortLimit, dayLimit] = limit.split(",").map((v) => Number(v.trim()));
  const [shortUsage, dayUsage] = usage.split(",").map((v) => Number(v.trim()));
  if (
    shortLimit === undefined ||
    dayLimit === undefined ||
    shortUsage === undefined ||
    dayUsage === undefined
  ) {
    return;
  }

  lastRateLimit = {
    shortTermUsage: shortUsage,
    shortTermLimit: shortLimit,
    dailyUsage: dayUsage,
    dailyLimit: dayLimit,
  };
}

/** Marge de sécurité : on s'arrête avant d'atteindre le quota exact. */
const QUOTA_HEADROOM = 5;

export function quotaExhausted(): { exhausted: boolean; retryAfterS: number } {
  if (!lastRateLimit) return { exhausted: false, retryAfterS: 0 };
  if (lastRateLimit.dailyUsage >= lastRateLimit.dailyLimit - QUOTA_HEADROOM) {
    // Le compteur quotidien se remet à zéro à minuit UTC.
    const now = new Date();
    const midnight = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() + 1,
    );
    return { exhausted: true, retryAfterS: Math.ceil((midnight - now.getTime()) / 1000) };
  }
  if (lastRateLimit.shortTermUsage >= lastRateLimit.shortTermLimit - QUOTA_HEADROOM) {
    // La fenêtre courte se remet à zéro tous les quarts d'heure ronds.
    const now = new Date();
    const minutesIntoWindow = now.getUTCMinutes() % 15;
    const secondsLeft = (15 - minutesIntoWindow) * 60 - now.getUTCSeconds();
    return { exhausted: true, retryAfterS: secondsLeft };
  }
  return { exhausted: false, retryAfterS: 0 };
}

async function refreshAccessToken(refreshToken: string) {
  const credentials = await getStravaCredentials();
  if (!credentials) {
    throw new StravaAuthError(
      "Strava non configuré (Client ID/Secret manquants) : impossible de rafraîchir le jeton.",
    );
  }
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    throw new StravaAuthError(
      `Échec du rafraîchissement du jeton Strava (${response.status}). ` +
        "Il faut probablement reconnecter le compte depuis les réglages.",
    );
  }
  return tokenResponseSchema.parse(await response.json());
}

/**
 * Retourne un access token valide, en le rafraîchissant si nécessaire.
 * Le refresh token est réécrit chiffré : Strava peut le faire tourner.
 */
export async function getAccessToken(): Promise<string> {
  const account = await prisma.stravaAccount.findFirst();
  if (!account) throw new StravaAuthError("Aucun compte Strava connecté.");

  const marginMs = 5 * 60 * 1000;
  if (account.expiresAt.getTime() - marginMs > Date.now()) {
    return decrypt(account.accessTokenEnc);
  }

  const refreshed = await refreshAccessToken(decrypt(account.refreshTokenEnc));
  await prisma.stravaAccount.update({
    where: { id: account.id },
    data: {
      accessTokenEnc: encrypt(refreshed.access_token),
      refreshTokenEnc: encrypt(refreshed.refresh_token),
      expiresAt: new Date(refreshed.expires_at * 1000),
    },
  });
  return refreshed.access_token;
}

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  params?: Record<string, string | number>,
): Promise<T> {
  const quota = quotaExhausted();
  if (quota.exhausted) {
    throw new StravaRateLimitError(
      "Quota Strava atteint, reprise automatique plus tard.",
      quota.retryAfterS,
    );
  }

  const url = new URL(`${API}${path}`);
  for (const [key, value] of Object.entries(params ?? {})) {
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${await getAccessToken()}` },
    cache: "no-store",
  });
  parseRateLimit(response.headers);

  if (response.status === 429) {
    const retryAfter = Number(response.headers.get("retry-after") ?? "900");
    throw new StravaRateLimitError("Quota Strava dépassé (429).", retryAfter);
  }
  if (response.status === 401) {
    throw new StravaAuthError("Jeton Strava refusé (401).");
  }
  if (!response.ok) {
    throw new Error(`Strava ${path} a répondu ${response.status}.`);
  }

  return schema.parse(await response.json());
}

export function listActivities<T>(
  schema: z.ZodType<T>,
  options: { page: number; perPage: number; before?: number; after?: number },
): Promise<T> {
  const params: Record<string, number> = {
    page: options.page,
    per_page: options.perPage,
  };
  if (options.before !== undefined) params.before = options.before;
  if (options.after !== undefined) params.after = options.after;
  return request("/athlete/activities", schema, params);
}

export function getActivity<T>(id: bigint | number, schema: z.ZodType<T>) {
  return request(`/activities/${id}`, schema, { include_all_efforts: "false" });
}

/**
 * Récupère les flux d'une activité. `key_by_type=true` renvoie un objet dont
 * les clés sont les flux réellement disponibles : une clé absente signifie
 * capteur absent, jamais zéro.
 */
export function getStreams(id: bigint | number) {
  return request(`/activities/${id}/streams`, streamSetSchema, {
    keys: STREAM_KEYS.join(","),
    key_by_type: "true",
  });
}

export { request as stravaRequest };
