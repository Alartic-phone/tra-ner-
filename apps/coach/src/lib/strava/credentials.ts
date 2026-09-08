import { z } from "zod";
import { prisma } from "../db.ts";
import { decrypt, encrypt } from "../crypto.ts";
import { getEnv } from "../env.ts";

/**
 * Identifiants de l'application Strava (Client ID / Client Secret).
 *
 * Deux sources possibles, dans cet ordre de priorité :
 *  1. saisis dans Réglages → Strava, stockés chiffrés dans `Setting`
 *     (`STRAVA_SETTING_KEY`) — pratique pour un déploiement sans accès au
 *     fichier `.env` (Fly.io, par exemple) ;
 *  2. `STRAVA_CLIENT_ID`/`STRAVA_CLIENT_SECRET` dans `.env` (docker compose).
 *
 * Le Client Secret est chiffré avec la même clé (`ENCRYPTION_KEY`) et la
 * même primitive (AES-256-GCM) que les jetons Strava — jamais en clair en
 * base. Le Client ID n'est pas un secret au sens de Strava (il apparaît déjà
 * en clair dans l'URL d'autorisation envoyée au navigateur) : il est stocké
 * tel quel.
 */

export const STRAVA_SETTING_KEY = "strava_credentials";

const storedCredentialsSchema = z.object({
  clientId: z.string().min(1),
  clientSecretEnc: z.string().min(1),
});

export type StravaCredentials = { clientId: string; clientSecret: string };

export async function getStravaCredentials(
  // Paramètre injectable uniquement pour le test verrou (base SQLite
  // jetable) — le code applicatif ne le passe jamais.
  client: Pick<typeof prisma, "setting"> = prisma,
): Promise<StravaCredentials | null> {
  const row = await client.setting.findUnique({ where: { key: STRAVA_SETTING_KEY } });
  if (row) {
    try {
      const parsed = storedCredentialsSchema.safeParse(JSON.parse(row.valueJson));
      if (parsed.success) {
        return { clientId: parsed.data.clientId, clientSecret: decrypt(parsed.data.clientSecretEnc) };
      }
    } catch {
      // Valeur corrompue : on retombe sur .env plutôt que de faire échouer
      // tout appel Strava pour une ligne de réglages illisible.
    }
  }

  const env = getEnv();
  if (env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET) {
    return { clientId: env.STRAVA_CLIENT_ID, clientSecret: env.STRAVA_CLIENT_SECRET };
  }
  return null;
}

export async function isStravaConfigured(
  client: Pick<typeof prisma, "setting"> = prisma,
): Promise<boolean> {
  return (await getStravaCredentials(client)) !== null;
}

/** Enregistre les identifiants saisis dans Réglages. Écrase toute valeur précédente. */
export async function setStravaCredentials(
  clientId: string,
  clientSecret: string,
  client: Pick<typeof prisma, "setting"> = prisma,
): Promise<void> {
  const valueJson = JSON.stringify({ clientId, clientSecretEnc: encrypt(clientSecret) });
  await client.setting.upsert({
    where: { key: STRAVA_SETTING_KEY },
    create: { key: STRAVA_SETTING_KEY, valueJson },
    update: { valueJson },
  });
}

/** Retire les identifiants saisis dans Réglages — retombe alors sur .env, s'il est renseigné. */
export async function clearStravaCredentials(
  client: Pick<typeof prisma, "setting"> = prisma,
): Promise<void> {
  await client.setting.deleteMany({ where: { key: STRAVA_SETTING_KEY } });
}
