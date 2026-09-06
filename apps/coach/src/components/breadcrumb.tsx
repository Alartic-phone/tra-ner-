import Link from "next/link";
import { ChevronLeft } from "lucide-react";

/**
 * Fil d'Ariane des pages détaillées : « ← Accueil / Activités ». On revient
 * toujours par l'accueil (section 2 du cahier des charges) — c'est le seul
 * chemin de retour depuis qu'il n'y a plus de menu latéral.
 */
export function Breadcrumb({ trail }: { trail: ReadonlyArray<{ label: string; href?: string }> }) {
  return (
    <nav
      aria-label="Fil d'Ariane"
      className="border-b border-[var(--color-border)] bg-[var(--color-bg)]"
    >
      <div className="mx-auto flex max-w-[1200px] items-center gap-1.5 px-6 py-2 text-xs text-[var(--color-muted)]">
        <Link href="/" className="flex items-center gap-0.5 hover:text-[var(--color-text)]">
          <ChevronLeft size={13} aria-hidden />
          Accueil
        </Link>
        {trail.map((item, i) => (
          <span key={i} className="flex items-center gap-1.5">
            <span aria-hidden>/</span>
            {item.href ? (
              <Link href={item.href} className="hover:text-[var(--color-text)]">
                {item.label}
              </Link>
            ) : (
              <span className="text-[var(--color-text)]">{item.label}</span>
            )}
          </span>
        ))}
      </div>
    </nav>
  );
}
