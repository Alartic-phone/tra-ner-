import type { ReactNode } from "react";
import { AppNav } from "@/components/nav.tsx";
import { PageTransition } from "@/components/ui/page-transition.tsx";

/**
 * Pas d'authentification : application mono-utilisateur qui n'écoute que
 * sur 127.0.0.1 (jamais le réseau local), cf. package.json et
 * apps/coach/README.md. Un mot de passe applicatif n'ajouterait rien face à
 * un accès qui n'est de toute façon possible que depuis cette machine.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh md:flex">
      <AppNav />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
