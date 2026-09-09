import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware.ts";
import { SESSION_COOKIE, signSession } from "./lib/auth.ts";

function requestFor(path: string, cookie?: string): NextRequest {
  const headers = cookie ? { cookie: `${SESSION_COOKIE}=${cookie}` } : undefined;
  return new NextRequest(new URL(path, "http://127.0.0.1:3000"), { headers });
}

describe("middleware (authentification configurée)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL ??= "file:./test.db";
    process.env.ENCRYPTION_KEY ??= "a".repeat(64);
    process.env.APP_PASSWORD = "un-mot-de-passe-de-test-suffisamment-long";
    process.env.SESSION_SECRET = "c".repeat(64);
  });

  it("laisse passer le webhook Strava sans cookie", async () => {
    const response = await middleware(requestFor("/api/strava/webhook"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("laisse passer la synchronisation externe sans cookie", async () => {
    const response = await middleware(requestFor("/api/strava/sync"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("laisse passer /login et /api/auth/login sans cookie", async () => {
    expect((await middleware(requestFor("/login"))).headers.get("location")).toBeNull();
    expect((await middleware(requestFor("/api/auth/login"))).headers.get("location")).toBeNull();
  });

  it("redirige vers /login une route protégée sans cookie, avec ?next=", async () => {
    const response = await middleware(requestFor("/reglages"));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("next")).toBe("/reglages");
  });

  it("redirige /api/strava/callback sans cookie (protégée, contrairement au webhook)", async () => {
    const response = await middleware(requestFor("/api/strava/callback"));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it("laisse passer un fichier .webp du dossier photos sans cookie (utilisé par la requête interne de /_next/image)", async () => {
    // /_next/image ne lit pas le fichier local directement : il refait une
    // requête interne à travers ce même middleware (fetchInternalImage,
    // node_modules/next/dist/server/image-optimizer.js). Sans .webp dans
    // PUBLIC_FILE, cette requête interne — sans cookie — était redirigée
    // vers /login, et Next recevait du HTML au lieu de l'image ("The
    // requested resource isn't a valid image").
    const response = await middleware(requestFor("/photos/nuit/unsplash-3s85IxVDyXE-1600.webp"));
    expect(response.headers.get("location")).toBeNull();
  });

  it("laisse passer une route protégée avec un cookie de session valide", async () => {
    const token = await signSession(Date.now());
    const response = await middleware(requestFor("/reglages", token));
    expect(response.headers.get("location")).toBeNull();
  });

  it("redirige vers /login avec un cookie expiré", async () => {
    const expired = await signSession(Date.now() - 31 * 24 * 60 * 60 * 1000);
    const response = await middleware(requestFor("/reglages", expired));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });

  it("redirige vers /login avec un cookie altéré", async () => {
    const token = await signSession(Date.now());
    const tampered = `${token.split(".")[0]}.${"0".repeat(64)}`;
    const response = await middleware(requestFor("/reglages", tampered));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/login");
  });
});
