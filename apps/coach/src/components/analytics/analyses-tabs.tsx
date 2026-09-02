import Link from "next/link";
import { cn } from "@/lib/utils.ts";

/**
 * Deux onglets, pas un menu déroulant : Charge (contenu historique de
 * /analyses) et Export (partie « dossier coach »). De simples liens plutôt
 * qu'un composant client à état — la page active se déduit du chemin, aucun
 * JS n'est nécessaire pour ça.
 */
export function AnalysesTabs({ active }: { active: "charge" | "export" }) {
  const tabs = [
    { key: "charge" as const, href: "/analyses", label: "Charge" },
    { key: "export" as const, href: "/analyses/export", label: "Export" },
  ];

  return (
    <div className="mt-3 flex gap-1 border-b border-[var(--color-border)]">
      {tabs.map((tab) => (
        <Link
          key={tab.key}
          href={tab.href}
          className={cn(
            "-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-[var(--duration-fast)]",
            active === tab.key
              ? "border-[var(--color-accent)] text-[var(--color-text)]"
              : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
