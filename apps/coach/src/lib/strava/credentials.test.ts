import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const PROJECT_ROOT = path.resolve(import.meta.dirname, "../../..");

let dir: string;
let client: PrismaClient;

/**
 * `getEnv()` (importé par ce module) mémoïse sa validation — chaque
 * scénario avec un `.env` différent doit repartir d'un module frais, comme
 * dans `env.test.ts`.
 */
async function freshCredentials() {
  vi.resetModules();
  return import("./credentials.ts");
}

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), "coach-strava-credentials-test-"));
  const url = `file:${path.join(dir, "test.db")}`;
  process.env.DATABASE_URL = url;

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

beforeEach(() => {
  process.env.ENCRYPTION_KEY = "b".repeat(64);
  delete process.env.STRAVA_CLIENT_ID;
  delete process.env.STRAVA_CLIENT_SECRET;
});

afterEach(async () => {
  await client.setting.deleteMany({});
});

describe("credentials Strava (priorité base > .env, secret jamais en clair)", () => {
  it("retombe sur .env quand rien n'est enregistré en base", async () => {
    process.env.STRAVA_CLIENT_ID = "12345";
    process.env.STRAVA_CLIENT_SECRET = "secret-env-1234567890";
    const { getStravaCredentials } = await freshCredentials();
    expect(await getStravaCredentials(client)).toEqual({
      clientId: "12345",
      clientSecret: "secret-env-1234567890",
    });
  });

  it("retourne null si ni la base ni .env ne sont configurés", async () => {
    const { getStravaCredentials, isStravaConfigured } = await freshCredentials();
    expect(await getStravaCredentials(client)).toBeNull();
    expect(await isStravaConfigured(client)).toBe(false);
  });

  it("enregistre puis relit les identifiants, secret chiffré en base (jamais en clair)", async () => {
    const { getStravaCredentials, setStravaCredentials, isStravaConfigured } = await freshCredentials();
    await setStravaCredentials("98765", "un-secret-tres-confidentiel", client);

    const row = await client.setting.findUnique({ where: { key: "strava_credentials" } });
    expect(row?.valueJson).not.toContain("un-secret-tres-confidentiel");

    expect(await getStravaCredentials(client)).toEqual({
      clientId: "98765",
      clientSecret: "un-secret-tres-confidentiel",
    });
    expect(await isStravaConfigured(client)).toBe(true);
  });

  it("la base l'emporte sur .env quand les deux sont présents", async () => {
    process.env.STRAVA_CLIENT_ID = "env-id";
    process.env.STRAVA_CLIENT_SECRET = "env-secret-1234567890";
    const { getStravaCredentials, setStravaCredentials } = await freshCredentials();
    await setStravaCredentials("db-id", "db-secret-1234567890", client);

    expect(await getStravaCredentials(client)).toEqual({
      clientId: "db-id",
      clientSecret: "db-secret-1234567890",
    });
  });

  it("clearStravaCredentials fait retomber sur .env", async () => {
    process.env.STRAVA_CLIENT_ID = "env-id";
    process.env.STRAVA_CLIENT_SECRET = "env-secret-1234567890";
    const { getStravaCredentials, setStravaCredentials, clearStravaCredentials } = await freshCredentials();
    await setStravaCredentials("db-id", "db-secret-1234567890", client);
    await clearStravaCredentials(client);

    expect(await getStravaCredentials(client)).toEqual({
      clientId: "env-id",
      clientSecret: "env-secret-1234567890",
    });
  });
});
