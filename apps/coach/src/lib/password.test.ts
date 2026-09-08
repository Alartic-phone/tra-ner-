import { beforeAll, describe, expect, it } from "vitest";
import { checkPassword } from "./password.ts";

describe("checkPassword (comparaison à temps constant sur digests SHA-256)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL ??= "file:./test.db";
    process.env.ENCRYPTION_KEY ??= "a".repeat(64);
    process.env.APP_PASSWORD = "un-mot-de-passe-de-test-suffisamment-long";
    process.env.SESSION_SECRET ??= "b".repeat(64);
  });

  it("accepte le mot de passe configuré", () => {
    expect(checkPassword("un-mot-de-passe-de-test-suffisamment-long")).toBe(true);
  });

  it("refuse un mot de passe incorrect", () => {
    expect(checkPassword("mauvais-mot-de-passe")).toBe(false);
  });

  it("refuse une chaîne vide", () => {
    expect(checkPassword("")).toBe(false);
  });
});
