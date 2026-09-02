import { getEnv } from "../env.ts";

/**
 * Filet de sécurité explicite, en plus de la garantie structurelle (le
 * schéma d'export — `schema.ts` — n'a tout simplement aucun champ pour un
 * jeton, une clé ou un identifiant de session : `collect.ts` ne lit jamais
 * `StravaAccount` ni le cookie de session).
 *
 * Ce filet existe pour le jour où le schéma évoluerait par erreur : il
 * scanne le contenu final, juste avant qu'il ne quitte le serveur, à la
 * recherche des secrets réels de configuration et des noms de champs
 * chiffrés connus de la base. Lève une exception plutôt que de renvoyer un
 * fichier suspect — jamais silencieux.
 */

const SENSITIVE_FIELD_NAMES = [
  "accessTokenEnc",
  "refreshTokenEnc",
  "ENCRYPTION_KEY",
  "APP_PASSWORD",
  "sessionToken",
  "webhookSubscriptionId",
];

/** Partie pure, testable sans configuration : les noms de champs sensibles connus. */
export function findSensitiveFieldName(content: string): string | null {
  return SENSITIVE_FIELD_NAMES.find((name) => content.includes(name)) ?? null;
}

export function assertNoSecrets(content: string): void {
  const found = findSensitiveFieldName(content);
  if (found) {
    throw new Error(`Export refusé : champ sensible détecté ("${found}") dans le contenu généré.`);
  }

  // Les secrets de configuration eux-mêmes (pas seulement leur nom de champ) :
  // si leur valeur apparaît littéralement dans l'export, quelque chose a mal
  // tourné en amont — mieux vaut planter que livrer.
  const env = getEnv();
  if (content.includes(env.ENCRYPTION_KEY)) {
    throw new Error("Export refusé : la clé de chiffrement apparaît dans le contenu généré.");
  }
  if (content.includes(env.APP_PASSWORD)) {
    throw new Error("Export refusé : le mot de passe applicatif apparaît dans le contenu généré.");
  }
}
