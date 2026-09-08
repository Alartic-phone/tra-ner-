import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `getEnv()` mémoïse sa validation (`cached`) : chaque scénario doit repartir
 * d'un module frais. `vi.resetModules()` + import dynamique évitent la
 * pollution entre cas, plutôt qu'un fichier de test par scénario.
 */
async function freshEnv() {
  vi.resetModules();
  return import("./env.ts");
}

const BASE_ENV = {
  DATABASE_URL: "file:./test.db",
  ENCRYPTION_KEY: "a".repeat(64),
};

describe("getEnv — validation d'APP_PASSWORD / SESSION_SECRET", () => {
  beforeEach(() => {
    process.env.DATABASE_URL = BASE_ENV.DATABASE_URL;
    process.env.ENCRYPTION_KEY = BASE_ENV.ENCRYPTION_KEY;
    delete process.env.APP_PASSWORD;
    delete process.env.SESSION_SECRET;
    delete process.env.PUBLIC_URL;
  });

  it("démarre sans APP_PASSWORD ni SESSION_SECRET quand PUBLIC_URL est absente (dev local)", async () => {
    const { getEnv, isAuthConfigured } = await freshEnv();
    expect(() => getEnv()).not.toThrow();
    expect(isAuthConfigured()).toBe(false);
  });

  it("refuse de démarrer si PUBLIC_URL est renseignée sans APP_PASSWORD", async () => {
    process.env.PUBLIC_URL = "https://coach.example.com";
    const { getEnv } = await freshEnv();
    expect(() => getEnv()).toThrow(/APP_PASSWORD/);
  });

  it("refuse de démarrer si APP_PASSWORD est renseigné sans SESSION_SECRET", async () => {
    process.env.APP_PASSWORD = "un-mot-de-passe-suffisamment-long";
    const { getEnv } = await freshEnv();
    expect(() => getEnv()).toThrow(/SESSION_SECRET/);
  });

  it("refuse un APP_PASSWORD de moins de 12 caractères", async () => {
    process.env.APP_PASSWORD = "trop-court";
    process.env.SESSION_SECRET = "b".repeat(64);
    const { getEnv } = await freshEnv();
    expect(() => getEnv()).toThrow(/APP_PASSWORD/);
  });

  it("démarre avec PUBLIC_URL, APP_PASSWORD et SESSION_SECRET tous renseignés", async () => {
    process.env.PUBLIC_URL = "https://coach.example.com";
    process.env.APP_PASSWORD = "un-mot-de-passe-suffisamment-long";
    process.env.SESSION_SECRET = "b".repeat(64);
    const { getEnv, isAuthConfigured } = await freshEnv();
    expect(() => getEnv()).not.toThrow();
    expect(isAuthConfigured()).toBe(true);
  });
});
