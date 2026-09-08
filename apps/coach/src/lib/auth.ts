import type { NextRequest, NextResponse } from "next/server";
import { getEnv } from "./env.ts";

/**
 * Protection d'accès minimale, volontairement.
 *
 * L'application est mono-utilisateur : il n'y a ni inscription, ni compte, ni
 * rôle. Le seul risque couvert ici est qu'un inconnu tombe sur les données si
 * l'application est exposée sur Internet. Un mot de passe unique en variable
 * d'environnement et un cookie de session signé (HMAC-SHA-256) suffisent
 * exactement à ça.
 *
 * Fonctions pures ou opérant sur NextRequest/NextResponse — jamais sur les
 * cookies de `next/headers` — pour rester utilisables aussi bien depuis le
 * middleware que depuis la route de connexion, et testables sans contexte
 * Next.js.
 *
 * Signature/vérification du cookie sur l'API Web Crypto (`crypto.subtle`),
 * jamais `node:crypto` : le middleware Next.js tourne en Edge runtime, où
 * `node:crypto` n'existe pas (vérifié à la construction —
 * `experimental.nodeMiddleware` n'est pas honoré par la version de Next.js
 * installée ici malgré sa présence dans les changelogs, et un webpack
 * `UnhandledSchemeError` sur `node:crypto` sanctionne le moindre import de ce
 * module, même inutilisé, dès qu'il est atteignable depuis ce fichier).
 * `checkPassword`, qui a besoin de `node:crypto`, vit donc dans un module
 * séparé (`lib/password.ts`) que seule la route de connexion importe.
 */

export const SESSION_COOKIE = "coach_session";
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

let cachedKey: Promise<CryptoKey> | null = null;

function sessionKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  const secret = getEnv().SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET absent : ne pas appeler ceci sans authentification configurée.");
  }
  const raw = new Uint8Array(secret.length / 2);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = Number.parseInt(secret.slice(i * 2, i * 2 + 2), 16);
  }
  cachedKey = crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return cachedKey;
}

function toHex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function hmac(payload: string): Promise<string> {
  const key = await sessionKey();
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return toHex(signature);
}

/**
 * Comparaison à temps constant sur deux chaînes hex de même longueur
 * attendue. `crypto.subtle` n'expose pas d'équivalent à
 * `timingSafeEqual` : boucle complète sans court-circuit, comme son
 * remplacement manuel habituel en environnement Edge.
 */
function constantTimeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/** Signe une date d'émission. Format du jeton : `<epoch ms>.<hmac hex>`. */
export async function signSession(issuedAtMs: number): Promise<string> {
  const payload = String(issuedAtMs);
  return `${payload}.${await hmac(payload)}`;
}

/**
 * Vrai seulement si le jeton est présent, sa signature valide (temps
 * constant) et son émission dans la fenêtre des 30 derniers jours. Toute
 * anomalie (absent, mal formé, altéré, expiré, daté dans le futur) renvoie
 * faux — jamais une exception.
 */
export async function verifySession(token: string | undefined, now = Date.now()): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const signatureHex = token.slice(dot + 1);

  const expectedHex = await hmac(payload);
  if (!constantTimeEqualHex(signatureHex, expectedHex)) return false;

  const issuedAtMs = Number(payload);
  if (!Number.isFinite(issuedAtMs)) return false;
  if (issuedAtMs > now) return false;
  return now - issuedAtMs <= SESSION_MAX_AGE_S * 1000;
}

/** Pose le cookie de session signé sur une réponse sortante. */
export async function setSessionCookie(response: NextResponse, now = Date.now()): Promise<void> {
  const env = getEnv();
  response.cookies.set(SESSION_COOKIE, await signSession(now), {
    httpOnly: true,
    // "strict" empêcherait ce cookie de repartir quand Strava nous redirige
    // vers /api/strava/callback (navigation inter-site) : la session
    // semblerait expirée à cet instant précis. "lax" reste protecteur contre
    // le CSRF (aucun envoi sur une requête POST inter-site) tout en laissant
    // passer les redirections GET de premier niveau — même choix que le
    // cookie d'état OAuth (STATE_COOKIE, lib/strava/oauth.ts).
    sameSite: "lax",
    secure: Boolean(env.PUBLIC_URL?.startsWith("https://")),
    path: "/",
    maxAge: SESSION_MAX_AGE_S,
  });
}

/**
 * IP du client, pour la limitation de tentatives. Suppose un reverse proxy
 * qui pose `X-Forwarded-For` correctement (cf. Déploiement, README) — sans
 * lui, l'en-tête est contrôlable par l'appelant et la limite devient
 * contournable ; acceptable pour un frein au brute-force, pas une garantie.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}
