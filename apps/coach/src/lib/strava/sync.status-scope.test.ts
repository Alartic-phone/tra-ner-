// Test verrou : `activities` (Strava seul) et `withStreams` (toutes
// sources) ne portent pas sur le même périmètre — les afficher côte à côte
// sans le dire a induit en erreur (cf. CONSOLIDATION.md, page Réglages
// affichant "134 importées" / "137 avec flux détaillés" comme si c'était
// comparable). Ce test échoue si un futur refactor confond les deux, ou si
// `corosWithStreams` recompte le mauvais périmètre pour la ligne FIT.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSyncStatus } from "./sync.ts";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");

let dir: string;
let client: PrismaClient;

function activity(overrides: Partial<Parameters<PrismaClient["activity"]["create"]>[0]["data"]>) {
  return {
    source: "strava",
    name: "Sortie",
    type: "Run",
    startedAt: new Date("2026-08-01T08:00:00.000Z"),
    startDay: "2026-08-01",
    distanceM: 5000,
    movingTimeS: 1500,
    elapsedTimeS: 1500,
    hasStreams: false,
    ...overrides,
  };
}

beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "coach-sync-status-test-"));
  const url = `file:${path.join(dir, "test.db")}`;

  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    cwd: PROJECT_ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });

  client = new PrismaClient({ datasourceUrl: url });

  // 2 activités Strava avec flux, 2 Strava sans flux (donc activities=4),
  // 1 COROS avec flux (tapis, pas de contrepartie Strava, donc
  // withStreams=3 : différent d'activities exprès), 1 COROS sans flux.
  await client.activity.create({ data: activity({ hasStreams: true }) });
  await client.activity.create({ data: activity({ hasStreams: true }) });
  await client.activity.create({ data: activity({ hasStreams: false }) });
  await client.activity.create({ data: activity({ hasStreams: false }) });
  await client.activity.create({ data: activity({ source: "coros", hasStreams: true }) });
  await client.activity.create({ data: activity({ source: "coros", hasStreams: false }) });
}, 30_000);

afterAll(async () => {
  await client.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("getSyncStatus (périmètres distincts, jamais confondus)", () => {
  it("activities ne compte que la source Strava", async () => {
    const status = await getSyncStatus(client);
    expect(status.activities).toBe(4);
  });

  it("withStreams compte toutes les sources confondues", async () => {
    const status = await getSyncStatus(client);
    expect(status.withStreams).toBe(3); // 2 Strava + 1 COROS
  });

  it("corosWithStreams ne compte que la source COROS — jamais réutilisé pour la ligne Strava", async () => {
    const status = await getSyncStatus(client);
    expect(status.corosWithStreams).toBe(1);
  });

  it("activities et withStreams diffèrent bien ici : les afficher côte à côte sans libellé explicite serait trompeur", async () => {
    const status = await getSyncStatus(client);
    expect(status.withStreams).not.toBe(status.activities);
  });
});
