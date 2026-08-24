import { cookies } from "next/headers";
import { getEnv } from "./env.ts";
import { safeEqual, sign } from "./crypto.ts";

/**
 * Protection d'accès minimale, volontairement.
 *
 * L'application est mono-utilisateur : il n'y a ni inscription, ni compte, ni
 * rôle. Le seul risque couvert ici est qu'un inconnu tombe sur les données si
 * l'application est exposée sur Internet. Un mot de passe unique en variable
 * d'environnement et un cookie de session signé (HMAC-SHA-256) suffisent
 * exactement à ça. Ajouter une bibliothèque d'authentification serait du
 * surdimensionnement pur.
 */

export const SESSION_COOKIE = "coach_session";

function buildToken(expiresAtMs: number): string {
  const payload = String(expiresAtMs);
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return false;
  const payload = token.slice(0, dot);
  const signature = token.slice(dot + 1);
  if (!safeEqual(signature, sign(payload))) return false;
  const expiresAt = Number(payload);
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

export function checkPassword(candidate: string): boolean {
  return safeEqual(candidate, getEnv().APP_PASSWORD);
}

export async function createSession(): Promise<void> {
  const env = getEnv();
  const maxAge = env.SESSION_DAYS * 24 * 60 * 60;
  const store = await cookies();
  store.set(SESSION_COOKIE, buildToken(Date.now() + maxAge * 1000), {
    httpOnly: true,
    sameSite: "strict",
    secure: env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function isAuthenticated(): Promise<boolean> {
  const store = await cookies();
  return verifyToken(store.get(SESSION_COOKIE)?.value);
}
