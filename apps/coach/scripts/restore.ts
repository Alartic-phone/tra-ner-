/**
 * Restauration de la base à partir d'une sauvegarde.
 *
 *   npm run restore -- backups/coach-2026-08-24T10-00-00.db
 *
 * La base actuelle n'est jamais écrasée silencieusement : elle est d'abord
 * mise de côté sous un nom horodaté.
 */
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, renameSync } from "node:fs";
import { dirname, resolve } from "node:path";

// Script autonome (pas de PrismaClient ici, qui charge .env lui-même côté
// app) : sans ceci, DATABASE_URL est absent et le chemin par défaut
// ci-dessous se combine avec sqlitePath() pour pointer sur prisma/prisma/.
process.loadEnvFile();

const url = process.env.DATABASE_URL ?? "file:./dev.db";

function sqlitePath(databaseUrl: string): string {
  if (!databaseUrl.startsWith("file:")) {
    throw new Error("Restauration SQLite uniquement. Pour PostgreSQL : pg_restore.");
  }
  const raw = databaseUrl.slice("file:".length);
  return resolve(raw.startsWith("/") ? raw : `prisma/${raw.replace(/^\.\//, "")}`);
}

function main(): void {
  const backup = process.argv[2];
  if (!backup) {
    throw new Error("Usage : npm run restore -- <chemin de la sauvegarde>");
  }
  const source = resolve(backup);
  if (!existsSync(source)) throw new Error(`Sauvegarde introuvable : ${source}`);

  // Contrôle d'intégrité avant de toucher à quoi que ce soit.
  const check = execFileSync("sqlite3", [source, "PRAGMA integrity_check;"])
    .toString()
    .trim();
  if (check !== "ok") {
    throw new Error(`La sauvegarde est corrompue (integrity_check : ${check}).`);
  }

  const target = sqlitePath(url);
  mkdirSync(dirname(target), { recursive: true });

  if (existsSync(target)) {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const aside = `${target}.remplacee-${stamp}`;
    renameSync(target, aside);
    console.log(`Base actuelle mise de côté : ${aside}`);
  }

  copyFileSync(source, target);
  console.log(`Base restaurée depuis ${source}`);
}

main();
