import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header.tsx";
import { PageTransition } from "@/components/ui/page-transition.tsx";

/**
 * L'accès est protégé en amont par le middleware (`src/middleware.ts`,
 * cookie de session signé, cf. `lib/auth.ts`) : ce layout n'a rien à vérifier
 * lui-même.
 *
 * Plus de menu latéral ni de barre du bas (section 2/6 de la refonte) :
 * l'en-tête est la seule navigation persistante, on revient toujours par
 * l'accueil. Le fil d'Ariane des pages détaillées (`<Breadcrumb />`) est
 * posé par chaque page, pas ici, puisque l'accueil n'en affiche pas.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <AppHeader />
      <main>
        <PageTransition>{children}</PageTransition>
      </main>
    </div>
  );
}
