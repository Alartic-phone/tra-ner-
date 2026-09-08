import { describe, expect, it } from "vitest";
import { isRateLimited, recordFailure, resetRateLimit } from "./rate-limit.ts";

describe("isRateLimited / recordFailure (limitation de tentatives par IP)", () => {
  it("laisse passer avant tout échec", () => {
    expect(isRateLimited("1.2.3.4")).toBe(false);
  });

  it("laisse passer les 5 premiers échecs, bloque la 6e tentative", () => {
    const ip = "1.2.3.5";
    for (let i = 0; i < 5; i++) {
      expect(isRateLimited(ip)).toBe(false);
      recordFailure(ip);
    }
    expect(isRateLimited(ip)).toBe(true);
  });

  it("ne mélange pas les compteurs entre IP différentes", () => {
    const a = "1.2.3.6";
    const b = "1.2.3.7";
    for (let i = 0; i < 5; i++) recordFailure(a);
    expect(isRateLimited(a)).toBe(true);
    expect(isRateLimited(b)).toBe(false);
  });

  it("resetRateLimit efface le compteur (connexion réussie)", () => {
    const ip = "1.2.3.8";
    for (let i = 0; i < 5; i++) recordFailure(ip);
    expect(isRateLimited(ip)).toBe(true);
    resetRateLimit(ip);
    expect(isRateLimited(ip)).toBe(false);
  });

  it("réautorise après expiration de la fenêtre de 15 minutes", () => {
    const ip = "1.2.3.9";
    const start = Date.now();
    for (let i = 0; i < 5; i++) recordFailure(ip, start);
    expect(isRateLimited(ip, start)).toBe(true);
    expect(isRateLimited(ip, start + 16 * 60 * 1000)).toBe(false);
  });
});
