// Test d'idempotence de l'import : réimporter le même fichier met à jour,
// ne duplique pas (clé (day, objective)). Base SQLite jetable, jamais la
// vraie base — même convention que sync.claim-next-job.test.ts.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeHeartRateZones } from "../metrics/zones.ts";
import { parsePlanImportCsv } from "./parse.ts";
import { writeImportedSessions } from "./repository.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");

let dir: string;
let client: PrismaClient;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "coach-plan-import-test-"));
  const dbPath = path.join(dir, "test.db");
  const url = `file:${dbPath}`;

  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  client = new PrismaClient({ datasourceUrl: url });
}, 30_000);

afterAll(async () => {
  await client.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

const ZONES = computeHeartRateZones(175);
const HEADER =
  "date;jour;type;statut;distance_km;duree_estimee_min;fc_cible_min;fc_cible_max;zone;objectif_seance;muscu_details;fractionne_details;notes";

function parseValid(...lines: string[]) {
  const buf = Buffer.from([HEADER, ...lines].join("\n"), "utf-8");
  const result = parsePlanImportCsv(buf, ZONES);
  if (!result.ok) throw new Error(result.fileError);
  if (result.rejected.length > 0) {
    throw new Error(`ligne(s) rejetée(s) inattendue(s) dans le test : ${JSON.stringify(result.rejected)}`);
  }
  return result.valid;
}

describe("writeImportedSessions — idempotence par (objectif, date)", () => {
  it("un premier import crée, un réimport du même fichier met à jour sans dupliquer", async () => {
    const rows = parseValid(
      "2026-09-08;Mardi;Course - reprise;A_FAIRE;7.5;45;143;152;Zone 2;Reprise en douceur.;;;Prescrit 7-8km",
      "2026-09-10;Jeudi;Sortie longue;A_FAIRE;9;55;143;152;Zone 2;Dernière sortie avant coupure.;;;",
    );

    const first = await writeImportedSessions(rows, client);
    expect(first).toEqual({ created: 2, updated: 0 });

    const afterFirst = await client.importedPlanSession.findMany();
    expect(afterFirst).toHaveLength(2);

    // Réimport strictement identique.
    const second = await writeImportedSessions(rows, client);
    expect(second).toEqual({ created: 0, updated: 2 });

    const afterSecond = await client.importedPlanSession.findMany();
    expect(afterSecond).toHaveLength(2); // toujours 2, pas 4 : pas de duplication.
  });

  it("une ligne modifiée sur la même clé (objectif, date) met à jour le contenu en place", async () => {
    const original = parseValid(
      "2026-09-12;Samedi;Course facile;A_FAIRE;6;42;140;148;Zone 2 basse;Resynchronisation.;;;Chaleur",
    );
    await writeImportedSessions(original, client);

    const revised = parseValid(
      "2026-09-12;Samedi;Course facile;A_FAIRE;6.5;44;140;148;Zone 2 basse;Resynchronisation.;;;Chaleur, distance ajustée",
    );
    const result = await writeImportedSessions(revised, client);
    expect(result).toEqual({ created: 0, updated: 1 });

    const rows = await client.importedPlanSession.findMany({
      where: { day: "2026-09-12", objective: "Resynchronisation." },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.distanceM).toBe(6500);
    expect(rows[0]!.notes).toBe("Chaleur, distance ajustée");
  });
});
