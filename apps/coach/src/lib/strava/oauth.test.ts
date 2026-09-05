import { beforeAll, describe, expect, it } from "vitest";
import { generateOAuthState, verifyOAuthState } from "./oauth.ts";

describe("verifyOAuthState (protection CSRF de l'aller-retour Strava)", () => {
  beforeAll(() => {
    // generateOAuthState()/verifyOAuthState() chiffrent la valeur du cookie
    // (voir crypto.ts) : ENCRYPTION_KEY doit être configurée, comme en
    // production, indépendamment du vrai .env de développement.
    process.env.DATABASE_URL ??= "file:./test.db";
    process.env.ENCRYPTION_KEY = "a".repeat(64);
  });

  it("accepte un état identique à celui posé en cookie", () => {
    const { state, cookieValue } = generateOAuthState();
    expect(verifyOAuthState(cookieValue, state)).toBe(true);
  });

  it("refuse un state absent (callback sans paramètre ?state=)", () => {
    const { cookieValue } = generateOAuthState();
    expect(verifyOAuthState(cookieValue, null)).toBe(false);
  });

  it("refuse un cookie absent (l'attaque exacte du décalage d'hôte : le cookie n'a jamais atteint le serveur)", () => {
    const { state } = generateOAuthState();
    expect(verifyOAuthState(undefined, state)).toBe(false);
  });

  it("refuse un state différent de celui du cookie", () => {
    const { cookieValue } = generateOAuthState();
    const { state: other } = generateOAuthState();
    expect(verifyOAuthState(cookieValue, other)).toBe(false);
  });

  it("refuse un cookie altéré ou rejoué depuis une autre origine (déchiffrement impossible)", () => {
    const { state } = generateOAuthState();
    expect(verifyOAuthState("valeur-cookie-invalide-non-chiffree", state)).toBe(false);
  });

  it("refuse même un état vide des deux côtés (pas de faux positif sur chaîne vide)", () => {
    expect(verifyOAuthState("", "")).toBe(false);
  });
});
