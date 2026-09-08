import { NextResponse, type NextRequest } from "next/server";
import { getClientIp, setSessionCookie } from "@/lib/auth.ts";
import { checkPassword } from "@/lib/password.ts";
import { isRateLimited, recordFailure, resetRateLimit } from "@/lib/rate-limit.ts";

export const dynamic = "force-dynamic";

/** Chemin de retour : doit rester interne à l'application, jamais une redirection ouverte. */
function sanitizeNext(raw: FormDataEntryValue | null): string {
  const value = typeof raw === "string" ? raw : "";
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) {
    return "/";
  }
  return value;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(request);
  const form = await request.formData();
  const next = sanitizeNext(form.get("next"));

  if (isRateLimited(ip)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("next", next);
    url.searchParams.set("limited", "1");
    return NextResponse.redirect(url, 303);
  }

  const password = String(form.get("password") ?? "");
  if (!checkPassword(password)) {
    recordFailure(ip);
    const url = new URL("/login", request.url);
    url.searchParams.set("next", next);
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url, 303);
  }

  resetRateLimit(ip);
  const response = NextResponse.redirect(new URL(next, request.url), 303);
  await setSessionCookie(response);
  return response;
}
