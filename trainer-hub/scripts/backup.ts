/**
 * Sauvegarde de la base.
 *
 * Plusieurs années de données d'entraînement ne doivent pas disparaître avec
 * un `rm` malheureux. La sauvegarde SQLite passe par `VACUUM INTO`, qui écrit
 * une copie cohérente même si l'application écrit pendant l'opération — une
 * simple copie de fichier peut, elle, capturer un état intermédiaire.
 *
 *   npm run backup            -> backups/trainer-hub-<horodatage>.db
 *   npm run backup -- chemin  -> chemin choisi
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Script autonome (pas de PrismaClient ici, qui charge .env lui-même côté
// app) : sans ceci, DATABASE_URL est absent et le chemin par défaut
// ci-dessous se combine avec sqlitePath() pour pointer sur prisma/prisma/.
process.loadEnvFile();

const url = process.env.DATABASE_URL ?? "file:./dev.db";

function sqlitePath(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error(
      "Sauvegarde SQLite uniquement. Pour PostgreSQL, utiliser pg_dump — " +
        "voir le README (§Sauvegarde et restauration).",
    );
  }
  const raw = databaseUrl.slice("file:".length);
  // Prisma résout les chemins relatifs depuis le dossier prisma/.
  return resolve(raw.startsWith("/") ? raw : `prisma/${raw.replace(/^\.\//, "")}`);
}

function main(): void {
  const source = sqlitePath(url);
  if (!existsSync(source)) {
    throw new Error(`Base introuvable : ${source}`);
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const target = resolve(process.argv[2] ?? `backups/trainer-hub-${stamp}.db`);
  mkdirSync(dirname(target), { recursive: true });

  if (existsSync(target)) {
    throw new Error(`Le fichier de destination existe déjà : ${target}`);
  }

  // VACUUM INTO produit une copie compacte et transactionnellement cohérente.
  execFileSync("sqlite3", [source, `VACUUM INTO '${target.replace(/'/g, "''")}'`], {
    stdio: "inherit",
  });

  const size = (statSync(target).size / 1_048_576).toFixed(1);
  console.log(`Sauvegarde écrite : ${target} (${size} Mo)`);
}

main();
