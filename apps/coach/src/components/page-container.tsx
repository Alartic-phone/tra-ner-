import type { ReactNode } from "react";
import { cn } from "@/lib/utils.ts";

/**
 * Alignement horizontal partagé par le gabarit de page et par le fil
 * d'Ariane (`Breadcrumb`) : les deux doivent tomber sur la même colonne à
 * toutes les largeurs d'écran, donc ils partagent exactement ces classes
 * plutôt que de les dupliquer avec un risque de divergence.
 */
export const PAGE_COLUMN_CLASS = "mx-auto max-w-[1200px] px-4 md:px-6";

/**
 * Gabarit de page unique : même largeur max et même centrage que l'accueil
 * pour toutes les pages secondaires. Ne fixe rien d'autre — l'espacement
 * vertical entre sections (`space-y-*`) reste au choix de chaque page via
 * `className`.
 */
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn(PAGE_COLUMN_CLASS, "py-6", className)}>{children}</div>;
}
