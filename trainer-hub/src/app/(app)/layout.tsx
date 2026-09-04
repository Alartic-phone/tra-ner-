import type { ReactNode } from "react";
import { AppNav } from "@/components/nav.tsx";
import { PageTransition } from "@/components/ui/page-transition.tsx";

/**
 * Coquille de l'application. Application personnelle et mono-utilisateur,
 * sans authentification : aucune protection d'accès ici, l'usage attendu
 * est local ou sur un réseau de confiance.
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
