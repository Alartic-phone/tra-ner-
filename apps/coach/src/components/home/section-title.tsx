import Link from "next/link";
import { ArrowRight } from "lucide-react";

/**
 * Titre de section de l'accueil, lien vers sa page dédiée. « Charge
 * hebdomadaire → /analyses », rendu « Charge hebdomadaire → tout
 * l'historique » : le texte de la flèche décrit la destination, pas
 * juste "voir plus". C'est le SEUL mécanisme de navigation vers les pages
 * détaillées depuis l'accueil (section 2 de la refonte).
 */
export function SectionTitle({
  href,
  children,
  destination,
}: {
  href: string;
  children: React.ReactNode;
  destination: string;
}) {
  return (
    <Link href={href} className="group flex items-baseline justify-between gap-3">
      <h2 className="font-display text-lg text-[var(--color-text)] sm:text-xl">{children}</h2>
      <span className="flex shrink-0 items-center gap-1 text-xs text-[var(--color-muted)] transition-colors group-hover:text-[var(--color-accent)]">
        {destination}
        <ArrowRight size={13} aria-hidden />
      </span>
    </Link>
  );
}
