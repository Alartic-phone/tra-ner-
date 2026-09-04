import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { getEnv } from "./env.ts";

/**
 * Chiffrement des secrets stockés en base (jetons Strava) et comparaison à
 * temps constant (état OAuth, secret de tâche planifiée).
 *
 * Uniquement des primitives de `node:crypto` : AES-256-GCM pour le
 * chiffrement authentifié. Aucune construction cryptographique maison.
 */

function key(): Buffer {
  return Buffer.from(getEnv().ENCRYPTION_KEY, "hex");
}

/** Chiffre une chaîne. Format de sortie : base64(iv | tag | ciphertext). */
export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}

export function decrypt(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  if (raw.length < 29) throw new Error("Charge chiffrée trop courte.");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const data = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

/** Comparaison à temps constant, pour ne rien fuiter par le temps de réponse. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    // timingSafeEqual exige des longueurs égales ; on compare quand même
    // quelque chose de la bonne taille pour ne pas court-circuiter.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}
