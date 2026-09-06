import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header.tsx";
import { PageTransition } from "@/components/ui/page-transition.tsx";

/**
 * Pas d'authentification : application mono-utilisateur qui n'écoute que
 * sur 127.0.0.1 (jamais le réseau local), cf. package.json et
 * apps/coach/README.md. Un mot de passe applicatif n'ajouterait rien face à
 * un accès qui n'est de toute façon possible que depuis cette machine.
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
