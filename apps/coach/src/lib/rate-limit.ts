/**
 * Limitation de tentatives en mémoire, par clé arbitraire (IP en pratique).
 *
 * Pas de dépendance nouvelle, pas de table : une Map suffit pour un usage
 * mono-utilisateur. Se réinitialise au redémarrage du process — acceptable,
 * ce n'est pas une protection contre un attaquant déterminé mais un frein au
 * brute-force trivial.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 5;

const attempts = new Map<string, { count: number; windowStart: number }>();

function currentCount(key: string, now: number): number {
  const entry = attempts.get(key);
  if (!entry) return 0;
  if (now - entry.windowStart > WINDOW_MS) {
    attempts.delete(key);
    return 0;
  }
  return entry.count;
}

/** Vrai si la clé a déjà atteint le maximum d'échecs sur la fenêtre courante. */
export function isRateLimited(key: string, now = Date.now()): boolean {
  return currentCount(key, now) >= MAX_ATTEMPTS;
}

/** Enregistre un échec (ex. mot de passe incorrect) pour la clé donnée. */
export function recordFailure(key: string, now = Date.now()): void {
  const count = currentCount(key, now);
  if (count === 0) {
    attempts.set(key, { count: 1, windowStart: now });
  } else {
    const entry = attempts.get(key)!;
    entry.count = count + 1;
  }
}

/** Efface le compteur d'une clé (ex. après une connexion réussie). */
export function resetRateLimit(key: string): void {
  attempts.delete(key);
}
