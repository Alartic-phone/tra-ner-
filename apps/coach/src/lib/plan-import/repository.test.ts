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
import { classifyImportRows, writeImportedSessions } from "./repository.ts";

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
  "date;jour;poste_F6;type;statut;distance_km;duree_estimee_min;fc_cible_min;fc_cible_max;zone;objectif_seance;muscu_details;fractionne_details;notes";

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
      "2026-09-08;Mardi;Matin;Course - reprise;A_FAIRE;7.5;45;143;152;Zone 2;Reprise en douceur.;;;Prescrit 7-8km",
      "2026-09-10;Jeudi;Repos;Sortie longue;A_FAIRE;9;55;143;152;Zone 2;Dernière sortie avant coupure.;;;",
    );

    const first = await writeImportedSessions(rows, client);
    expect(first).toEqual({ created: 2, updated: 0, deleted: 0 });

    const afterFirst = await client.importedPlanSession.findMany();
    expect(afterFirst).toHaveLength(2);

    // Réimport strictement identique.
    const second = await writeImportedSessions(rows, client);
    expect(second).toEqual({ created: 0, updated: 2, deleted: 0 });

    const afterSecond = await client.importedPlanSession.findMany();
    expect(afterSecond).toHaveLength(2); // toujours 2, pas 4 : pas de duplication.
  });

  it("une ligne modifiée sur la même clé (objectif, date) met à jour le contenu en place", async () => {
    const original = parseValid(
      "2026-09-12;Samedi;Matin;Course facile;A_FAIRE;6;42;140;148;Zone 2 basse;Resynchronisation.;;;Chaleur",
    );
    await writeImportedSessions(original, client);

    const revised = parseValid(
      "2026-09-12;Samedi;Matin;Course facile;A_FAIRE;6.5;44;140;148;Zone 2 basse;Resynchronisation.;;;Chaleur, distance ajustée",
    );
    const result = await writeImportedSessions(revised, client);
    expect(result).toEqual({ created: 0, updated: 1, deleted: 0 });

    const rows = await client.importedPlanSession.findMany({
      where: { day: "2026-09-12", objective: "Resynchronisation." },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.distanceM).toBe(6500);
    expect(rows[0]!.notes).toBe("Chaleur, distance ajustée");
  });
});

describe("writeImportedSessions — clé (day, orderInDay), §3.1", () => {
  it("deux séances le même jour avec un objectif vide produisent deux lignes distinctes", async () => {
    const rows = parseValid(
      "2026-10-05;Lundi;Matin;Renforcement;A_FAIRE;;35;;;;;;;",
      "2026-10-05;Lundi;Matin;Course - reprise;A_FAIRE;7;40;;;;;;;",
    );
    const result = await writeImportedSessions(rows, client);
    expect(result).toEqual({ created: 2, updated: 0, deleted: 0 });

    const inDb = await client.importedPlanSession.findMany({
      where: { day: "2026-10-05" },
      orderBy: { orderInDay: "asc" },
    });
    expect(inDb).toHaveLength(2);
    expect(inDb[0]!.orderInDay).toBe(0);
    expect(inDb[0]!.type).toBe("Renforcement");
    expect(inDb[1]!.orderInDay).toBe(1);
    expect(inDb[1]!.type).toBe("Course - reprise");
  });

  it("réimporter le même fichier à deux séances par jour ne duplique pas", async () => {
    const rows = parseValid(
      "2026-10-06;Mardi;Matin;Renforcement;A_FAIRE;;35;;;;;;;",
      "2026-10-06;Mardi;Matin;Course - reprise;A_FAIRE;7;40;;;;;;;",
    );
    await writeImportedSessions(rows, client);
    const second = await writeImportedSessions(rows, client);
    expect(second).toEqual({ created: 0, updated: 2, deleted: 0 });

    const inDb = await client.importedPlanSession.findMany({ where: { day: "2026-10-06" } });
    expect(inDb).toHaveLength(2);
  });

  it("réimporter avec une seule séance ce jour-là supprime la ligne devenue orpheline, et l'annonce", async () => {
    const rows = parseValid(
      "2026-10-07;Mercredi;Matin;Renforcement;A_FAIRE;;35;;;;;;;",
      "2026-10-07;Mercredi;Matin;Course - reprise;A_FAIRE;7;40;;;;;;;",
    );
    await writeImportedSessions(rows, client);

    const onlyOne = parseValid("2026-10-07;Mercredi;Matin;Renforcement;A_FAIRE;;35;;;;;;;");

    // L'aperçu annonce la suppression avant toute écriture.
    const { deletions } = await classifyImportRows(onlyOne, client);
    expect(deletions).toHaveLength(1);
    expect(deletions[0]!.day).toBe("2026-10-07");
    expect(deletions[0]!.type).toBe("Course - reprise");

    const result = await writeImportedSessions(onlyOne, client);
    expect(result).toEqual({ created: 0, updated: 1, deleted: 1 });

    const inDb = await client.importedPlanSession.findMany({ where: { day: "2026-10-07" } });
    expect(inDb).toHaveLength(1);
    expect(inDb[0]!.type).toBe("Renforcement");
  });

  it("un import qui ne couvre qu'une semaine ne touche aucune ligne en dehors de cette semaine", async () => {
    // Séance d'une semaine totalement hors du fichier qui sera réimporté ensuite.
    const untouched = parseValid("2026-11-02;Lundi;Matin;Sortie longue;A_FAIRE;15;80;;;;;;;");
    await writeImportedSessions(untouched, client);
    const before = await client.importedPlanSession.findFirst({ where: { day: "2026-11-02" } });

    // Fichier couvrant une autre semaine entière (2026-10-12 au 2026-10-18) —
    // ne mentionne jamais le 2026-11-02.
    const otherWeek = parseValid(
      "2026-10-12;Lundi;Matin;Course facile;A_FAIRE;6;40;;;;;;;",
      "2026-10-13;Mardi;Matin;Repos;A_FAIRE;;;;;;;;;",
    );
    await writeImportedSessions(otherWeek, client);

    const after = await client.importedPlanSession.findFirst({ where: { day: "2026-11-02" } });
    expect(after).not.toBeNull();
    expect(after!.id).toBe(before!.id);
    expect(after!.updatedAt).toEqual(before!.updatedAt);
  });
});
