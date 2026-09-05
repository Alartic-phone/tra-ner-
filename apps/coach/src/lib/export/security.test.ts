import { describe, expect, it } from "vitest";
import { assertNoSecrets, findSensitiveFieldName } from "./security.ts";

describe("assertNoSecrets (filet de sécurité de l'export)", () => {
  it("laisse passer un contenu normal", () => {
    expect(() => assertNoSecrets("# Export\n\n- Distance : 10,71 km\n")).not.toThrow();
  });

  it("refuse un contenu qui porte le nom d'un champ chiffré Strava", () => {
    expect(() => assertNoSecrets('{"accessTokenEnc":"abc123"}')).toThrow(/accessTokenEnc/);
  });

  it("refuse un contenu qui porte le nom du champ de désabonnement webhook", () => {
    expect(() => assertNoSecrets('{"webhookSubscriptionId":42}')).toThrow(/webhookSubscriptionId/);
  });

  it("refuse un contenu qui contient la clé de chiffrement en clair", () => {
    // getEnv() exige une configuration complète : simulée ici pour exercer
    // ce chemin précis, indépendamment du vrai .env de développement.
    process.env.DATABASE_URL ??= "file:./test.db";
    process.env.ENCRYPTION_KEY = "a".repeat(64);
    expect(() => assertNoSecrets(`clé de test : ${"a".repeat(64)}`)).toThrow(/clé de chiffrement/);
  });

  it("findSensitiveFieldName renvoie null sur un contenu propre", () => {
    expect(findSensitiveFieldName("aucun secret ici")).toBeNull();
  });
});
