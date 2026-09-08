import { createHash, timingSafeEqual } from "node:crypto";
import { getEnv } from "./env.ts";

/**
 * Isolé de `lib/auth.ts` : `node:crypto` casse le webpack Edge du
 * middleware au moindre import atteignable, même inutilisé. Ce module n'est
 * importé que par la route de connexion (`app/api/auth/login/route.ts`), qui
 * tourne toujours en runtime Node.js.
 */

/**
 * Comparaison en temps constant sur des digests SHA-256 (jamais `===`, jamais
 * de comparaison directe sur des chaînes de longueur variable, qui fuiterait
 * la longueur du mot de passe par le temps de réponse).
 */
export function checkPassword(candidate: string): boolean {
  const appPassword = getEnv().APP_PASSWORD;
  if (!appPassword) return false;
  const candidateDigest = createHash("sha256").update(candidate).digest();
  const expectedDigest = createHash("sha256").update(appPassword).digest();
  return timingSafeEqual(candidateDigest, expectedDigest);
}
