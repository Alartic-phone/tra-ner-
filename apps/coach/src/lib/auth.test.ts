import { beforeAll, describe, expect, it } from "vitest";
import { signSession, verifySession } from "./auth.ts";

describe("verifySession / signSession (cookie de session signé)", () => {
  beforeAll(() => {
    // Configuration simulée, indépendante du vrai .env de développement —
    // même convention que oauth.test.ts.
    process.env.DATABASE_URL ??= "file:./test.db";
    process.env.ENCRYPTION_KEY ??= "a".repeat(64);
    process.env.APP_PASSWORD = "un-mot-de-passe-de-test-suffisamment-long";
    process.env.SESSION_SECRET = "b".repeat(64);
  });

  it("accepte une signature valide et non expirée", async () => {
    const token = await signSession(Date.now());
    expect(await verifySession(token)).toBe(true);
  });

  it("refuse une signature falsifiée", async () => {
    const token = await signSession(Date.now());
    const [payload] = token.split(".");
    const tampered = `${payload}.${"0".repeat(64)}`;
    expect(await verifySession(tampered)).toBe(false);
  });

  it("refuse un jeton dont le payload a été modifié sans re-signer", async () => {
    const token = await signSession(Date.now());
    const [, signature] = token.split(".");
    const tampered = `${Date.now() + 1_000_000}.${signature}`;
    expect(await verifySession(tampered)).toBe(false);
  });

  it("refuse un cookie expiré (émis il y a plus de 30 jours)", async () => {
    const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
    const token = await signSession(thirtyOneDaysAgo);
    expect(await verifySession(token)).toBe(false);
  });

  it("accepte un cookie émis juste avant l'expiration", async () => {
    const twentyNineDaysAgo = Date.now() - 29 * 24 * 60 * 60 * 1000;
    const token = await signSession(twentyNineDaysAgo);
    expect(await verifySession(token)).toBe(true);
  });

  it("refuse un jeton daté dans le futur", async () => {
    const token = await signSession(Date.now() + 60_000);
    expect(await verifySession(token)).toBe(false);
  });

  it("refuse un jeton absent ou mal formé", async () => {
    expect(await verifySession(undefined)).toBe(false);
    expect(await verifySession("")).toBe(false);
    expect(await verifySession("sans-point")).toBe(false);
  });
});
