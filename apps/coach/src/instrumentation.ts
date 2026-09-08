/**
 * Point d'entrée exécuté une fois au démarrage du process Node (avant la
 * première requête), aussi bien en `next dev` qu'en `next start`/serveur
 * standalone. Valide la configuration ici plutôt que de laisser une config
 * invalide échouer au hasard sur la première requête servie.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("@/lib/env.ts");
    getEnv();
  }
}
