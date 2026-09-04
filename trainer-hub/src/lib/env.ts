import { z } from "zod";

/**
 * Validation de la configuration au démarrage.
 *
 * Le principe : l'application refuse de démarrer avec une configuration
 * incomplète plutôt que de tomber en marche à la première requête. Les
 * variables réellement optionnelles (Strava, Claude) ne bloquent pas le
 * démarrage : leurs fonctionnalités sont simplement désactivées, et l'UI
 * l'indique.
 */

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL est requis"),

  /**
   * Clé de chiffrement des jetons Strava stockés en base. 32 octets en
   * hexadécimal : `openssl rand -hex 32`.
   */
  ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "ENCRYPTION_KEY doit faire 64 caractères hexadécimaux"),

  /**
   * URL publique de l'application. Renseignée = webhook Strava possible
   * (synchronisation temps réel). Vide = mode bouton « Synchroniser » + cron.
   */
  PUBLIC_URL: z.string().url().optional().or(z.literal("")).transform((v) => v || undefined),

  STRAVA_CLIENT_ID: z.string().optional(),
  STRAVA_CLIENT_SECRET: z.string().optional(),
  /** Jeton arbitraire de vérification du webhook Strava. */
  STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().optional(),

  /**
   * Secret partagé permettant à une tâche planifiée de déclencher la
   * synchronisation sans session. Absent = seul un utilisateur connecté peut
   * la déclencher.
   */
  CRON_SECRET: z
    .string()
    .min(16)
    .optional()
    .or(z.literal(""))
    .transform((v) => v || undefined),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5"),

  /**
   * Clé Static Maps API (maptiler.com, gratuite en usage personnel) pour
   * afficher un vrai fond de carte sous le tracé GPS. Absente = repli sur
   * le tracé seul en SVG (déjà en place), jamais une image cassée.
   */
  MAPTILER_API_KEY: z.string().optional(),

  TZ: z.string().default("Europe/Paris"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Configuration invalide (.env) :\n${details}\n\n` +
        "Copier .env.example vers .env et compléter. " +
        "Générer les clés avec : openssl rand -hex 32",
    );
  }
  cached = parsed.data;
  return cached;
}

/** Strava est utilisable si l'application est déclarée sur le portail dev. */
export function isStravaConfigured(): boolean {
  const env = getEnv();
  return Boolean(env.STRAVA_CLIENT_ID && env.STRAVA_CLIENT_SECRET);
}

/**
 * Le webhook Strava exige une URL publique joignable par Strava. Sans elle, la
 * synchronisation se fait par bouton et par tâche planifiée.
 */
export function isWebhookCapable(): boolean {
  const env = getEnv();
  return Boolean(env.PUBLIC_URL && !env.PUBLIC_URL.includes("localhost"));
}

export function isCoachConfigured(): boolean {
  return Boolean(getEnv().ANTHROPIC_API_KEY);
}

/** Fond de carte réel disponible sous le tracé GPS. */
export function isMapConfigured(): boolean {
  return Boolean(getEnv().MAPTILER_API_KEY);
}
