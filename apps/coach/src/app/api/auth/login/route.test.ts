import { beforeAll, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route.ts";
import { SESSION_COOKIE } from "@/lib/auth.ts";

const PASSWORD = "un-mot-de-passe-de-test-suffisamment-long";

function loginRequest(password: string, ip: string, next = "/reglages"): NextRequest {
  const form = new FormData();
  form.set("password", password);
  form.set("next", next);
  return new NextRequest("http://127.0.0.1:3000/api/auth/login", {
    method: "POST",
    body: form,
    headers: { "x-forwarded-for": ip },
  });
}

describe("POST /api/auth/login", () => {
  beforeAll(() => {
    process.env.DATABASE_URL ??= "file:./test.db";
    process.env.ENCRYPTION_KEY ??= "a".repeat(64);
    process.env.APP_PASSWORD = PASSWORD;
    process.env.SESSION_SECRET = "d".repeat(64);
  });

  it("mot de passe correct : redirige vers next et pose le cookie de session", async () => {
    const response = await POST(loginRequest(PASSWORD, "10.0.0.1", "/reglages"));
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/reglages");
    expect(response.cookies.get(SESSION_COOKIE)?.value).toBeTruthy();
  });

  it("mot de passe incorrect : redirige vers /login avec ?error=1, pas de cookie", async () => {
    const response = await POST(loginRequest("mauvais", "10.0.0.2"));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("error")).toBe("1");
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });

  it("un next externe (redirection ouverte) est ramené à /", async () => {
    const response = await POST(loginRequest(PASSWORD, "10.0.0.3", "https://evil.example/"));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/");
  });

  it("bloque après 5 échecs : la 6e tentative renvoie ?limited=1 sans vérifier le mot de passe", async () => {
    const ip = "10.0.0.4";
    for (let i = 0; i < 5; i++) {
      await POST(loginRequest("mauvais", ip));
    }
    const response = await POST(loginRequest(PASSWORD, ip));
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("limited")).toBe("1");
    expect(response.cookies.get(SESSION_COOKIE)).toBeUndefined();
  });
});
