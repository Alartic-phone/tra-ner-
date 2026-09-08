import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "./middleware.ts";

describe("middleware (APP_PASSWORD absent — développement local)", () => {
  beforeAll(() => {
    process.env.DATABASE_URL ??= "file:./test.db";
    process.env.ENCRYPTION_KEY ??= "a".repeat(64);
    delete process.env.APP_PASSWORD;
    delete process.env.SESSION_SECRET;
    delete process.env.PUBLIC_URL;
  });

  it("laisse passer une route protégée sans cookie quand l'authentification n'est pas configurée", async () => {
    const request = new NextRequest(new URL("/reglages", "http://127.0.0.1:3000"));
    const response = await middleware(request);
    expect(response.headers.get("location")).toBeNull();
  });
});
