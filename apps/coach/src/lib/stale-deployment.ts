/**
 * Détecte une erreur causée par un bundle client périmé après un
 * redéploiement : le navigateur a encore l'ancien JavaScript en mémoire
 * (page ouverte depuis avant le déploiement) et référence soit un chunk qui
 * n'existe plus (`ChunkLoadError`), soit une Server Action dont l'identifiant
 * a changé (message Next.js "Failed to find Server Action … This request
 * might be from an older or newer deployment").
 *
 * Distinction utile côté UI : "Réessayer" ne répare rien ici (le bundle en
 * mémoire reste périmé) — il faut recharger la page pour récupérer le
 * nouveau JavaScript.
 */
export function isStaleDeploymentError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "ChunkLoadError") return true;
  return /Failed to find Server Action|older or newer deployment/i.test(error.message);
}
