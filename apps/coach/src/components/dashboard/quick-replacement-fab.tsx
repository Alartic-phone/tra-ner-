import Link from "next/link";
import { Repeat } from "lucide-react";

/**
 * Raccourci fixe, au-dessus de la nav mobile : on m'appelle en sortant de
 * poste pour couvrir un collègue, c'est l'imprévu numéro un (cf. CLAUDE.md).
 * Un appui ouvre directement la feuille de choix du poste sur aujourd'hui —
 * le deuxième appui, sur le type de poste, termine la saisie. Uniquement sur
 * mobile : sur grand écran le calendrier est toujours visible dans la nav
 * latérale, ce raccourci n'apporte rien.
 */
export function QuickReplacementFab({ today }: { today: string }) {
  return (
    <Link
      href={{ pathname: "/calendrier", query: { jour: today } }}
      aria-label="Déclarer un remplacement de poste aujourd'hui"
      className="fixed right-4 z-20 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-accent)] text-[#06101f] shadow-[var(--shadow-elevated)] transition-transform duration-[var(--duration-fast)] active:scale-[0.95] md:hidden"
      style={{ bottom: "calc(4.75rem + env(safe-area-inset-bottom))" }}
    >
      <Repeat size={22} aria-hidden />
    </Link>
  );
}
