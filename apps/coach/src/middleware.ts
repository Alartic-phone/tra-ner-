import { NextResponse, type NextRequest } from "next/server";
import { isAuthConfigured } from "@/lib/env.ts";
import { SESSION_COOKIE, verifySession } from "@/lib/auth.ts";

/**
 * Chemins joignables sans cookie de session :
 * - le webhook Strava (appelé par Strava, protégé par STRAVA_WEBHOOK_VERIFY_TOKEN) ;
 * - la synchronisation externe (appelée par le service `sync`, protégée par CRON_SECRET) ;
 * - la page et la route de connexion elles-mêmes, sans quoi impossible de se connecter.
 * /api/strava/callback n'est PAS dans cette liste : c'est le navigateur de
 * l'utilisateur qui le suit, il porte donc le cookie.
 */
const PUBLIC_PATHS = ["/api/strava/webhook", "/api/strava/sync", "/login", "/api/auth/login"];

// Fichiers statiques et manifeste PWA : aucune donnée personnelle dedans.
// `.webp` inclus : /_next/image ne lit jamais un fichier local directement,
// il refait une requête interne à travers CE MÊME middleware
// (fetchInternalImage, node_modules/next/dist/server/image-optimizer.js) —
// sans cookie de session. Sans lui ici, cette requête interne pour les
// photos d'ambiance (public/photos/**/*.webp) était redirigée vers /login,
// et Next recevait du HTML au lieu de l'image.
const PUBLIC_FILE = /\.(?:svg|png|jpg|jpeg|webp|ico|webmanifest|json|txt|xml|woff2?)$/;

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_FILE.test(pathname)) return true;
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!isAuthConfigured()) {
    // Développement local sans PUBLIC_URL : env.ts garantit que ce cas
    // n'arrive jamais une fois l'application exposée.
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (await verifySession(token)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("next", `${pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
