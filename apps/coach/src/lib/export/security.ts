import { getEnv } from "../env.ts";

/**
 * Filet de sécurité explicite, en plus de la garantie structurelle (le
 * schéma d'export — `schema.ts` — n'a tout simplement aucun champ pour un
 * jeton ou une clé : `gather.ts` ne lit jamais `StravaAccount.accessTokenEnc`
 * ni les autres champs chiffrés pour construire l'export).
 *
 * Ce filet existe pour le jour où le schéma évoluerait par erreur : il
 * scanne le contenu final, juste avant qu'il ne quitte le serveur (fichier
 * téléchargé ou script `npm run export`), à la recherche des noms de champs
 * chiffrés connus de la base et des secrets réels de configuration. Lève une
 * exception plutôt que de renvoyer un fichier suspect — jamais silencieux.
 */

const SENSITIVE_FIELD_NAMES = ["accessTokenEnc", "refreshTokenEnc", "webhookSubscriptionId"];

/** Partie pure, testable sans configuration : les noms de champs sensibles connus. */
export function findSensitiveFieldName(content: string): string | null {
  return SENSITIVE_FIELD_NAMES.find((name) => content.includes(name)) ?? null;
}

export function assertNoSecrets(content: string): void {
  const found = findSensitiveFieldName(content);
  if (found) {
    throw new Error(`Export refusé : champ sensible détecté ("${found}") dans le contenu généré.`);
  }

  // Le secret de configuration lui-même (pas seulement le nom du champ) :
  // si sa valeur apparaît littéralement dans l'export, quelque chose a mal
  // tourné en amont — mieux vaut planter que livrer. `getEnv()` exige une
  // configuration complète (DATABASE_URL, etc.) : si elle est absente —
  // seulement en tests, l'app ne démarre pas sinon — on saute ce contrôle
  // plutôt que de faire échouer l'export pour une raison sans rapport.
  try {
    const env = getEnv();
    if (content.includes(env.ENCRYPTION_KEY)) {
      throw new Error("Export refusé : la clé de chiffrement apparaît dans le contenu généré.");
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Export refusé")) throw e;
  }
}
