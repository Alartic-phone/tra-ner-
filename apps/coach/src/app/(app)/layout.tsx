import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/auth.ts";
import { AppNav } from "@/components/nav.tsx";
import { PageTransition } from "@/components/ui/page-transition.tsx";

/**
 * Coquille authentifiée. La vérification se fait ici plutôt que dans un
 * middleware : le middleware Next s'exécute par défaut sur le runtime Edge,
 * où `node:crypto` — donc la vérification HMAC du cookie — n'est pas
 * disponible. Un layout serveur fait le même travail sans compromis.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!(await isAuthenticated())) redirect("/login");

  return (
    <div className="min-h-dvh md:flex">
      <AppNav />
      <main className="min-w-0 flex-1 pb-20 md:pb-0">
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
