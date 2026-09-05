// Test verrou : un import ne doit jamais détruire des données avant d'avoir
// validé leur remplacement (cf. CONSOLIDATION.md, incident du 05/09/2026 —
// deleteMany hors transaction, suivi d'un createMany qui a échoué après
// coup). Base SQLite jetable, jamais la vraie base de dev — replaceLaps()
// prend un client injecté pour ça, voir sync.ts.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { replaceLaps } from "./sync.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");

let dir: string;
let client: PrismaClient;

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "coach-replace-laps-test-"));
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

async function seedActivityWithLaps(activityId: string) {
  await client.activity.create({
    data: {
      id: activityId,
      source: "strava",
      name: "Test de seuil",
      type: "Run",
      startedAt: new Date("2026-08-29T07:38:17.000Z"),
      startDay: "2026-08-29",
      distanceM: 10714,
      movingTimeS: 3455,
      elapsedTimeS: 3455,
    },
  });
  await client.lap.createMany({
    data: Array.from({ length: 12 }, (_, i) => ({
      activityId,
      lapIndex: i + 1,
      distanceM: 1000,
      elapsedTimeS: 300,
      movingTimeS: 300,
      splitIndex: i + 1,
      isManual: false,
    })),
  });
}

describe("replaceLaps (atomicité suppression + recréation)", () => {
  it("remplace bien les tours quand la recréation réussit", async () => {
    const activityId = "activity-ok";
    await seedActivityWithLaps(activityId);

    await replaceLaps(
      activityId,
      [{ lapIndex: 1, distanceM: 2000, elapsedTimeS: 500, movingTimeS: 500, splitIndex: 1, isManual: false }],
      client,
    );

    const laps = await client.lap.findMany({ where: { activityId } });
    expect(laps).toHaveLength(1);
    expect(laps[0]?.distanceM).toBe(2000);
  });

  it("ne perd AUCUN tour existant si la recréation échoue (violation de contrainte unique déclenchée exprès)", async () => {
    const activityId = "activity-failing-replace";
    await seedActivityWithLaps(activityId);

    const before = await client.lap.findMany({ where: { activityId }, orderBy: { lapIndex: "asc" } });
    expect(before).toHaveLength(12);

    // Deux tours avec le même lapIndex : viole @@unique([activityId, lapIndex])
    // pendant le createMany, une fois le deleteMany déjà préparé dans la
    // même transaction. Sans $transaction, le deleteMany serait validé seul.
    const brokenRows = [
      { lapIndex: 1, distanceM: 1, elapsedTimeS: 1, movingTimeS: 1, splitIndex: 1, isManual: false },
      { lapIndex: 1, distanceM: 2, elapsedTimeS: 2, movingTimeS: 2, splitIndex: 1, isManual: false },
    ];

    await expect(replaceLaps(activityId, brokenRows, client)).rejects.toThrow();

    const after = await client.lap.findMany({ where: { activityId }, orderBy: { lapIndex: "asc" } });
    expect(after).toHaveLength(12);
    expect(after.map((l) => l.distanceM)).toEqual(before.map((l) => l.distanceM));
  });
});
