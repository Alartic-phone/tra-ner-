import { cn } from "@/lib/utils.ts";

/**
 * Bloc de chargement générique. La taille exacte (largeur, hauteur, radius)
 * est toujours fixée par l'appelant pour matcher le composant final — jamais
 * un spinner générique qui ferait sauter la mise en page à l'arrivée des
 * données. `animate-pulse` est déjà coupé par la règle globale
 * `prefers-reduced-motion` de globals.css.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-[var(--radius-card)] bg-[var(--color-surface-2)]", className)}
    />
  );
}
