import Link from "next/link";
import { buttonVariants } from "@/components/ui/button.tsx";

/**
 * 404 dans le design de l'app plutôt que la page générique de Next.js
 * (audit fonctionnel du 07/09/2026 : `/activites/id-inexistant` retombait
 * sur le rendu par défaut, hors charte, à l'intérieur même de l'en-tête de
 * l'app).
 */
export default function NotFound() {
  return (
    <div className="mx-auto max-w-[1100px] p-4 md:p-6">
      <div className="mt-10 text-center">
        <p className="font-display text-2xl text-[var(--color-text)]">Page introuvable</p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Cette page n&apos;existe pas ou plus.
        </p>
        <Link href="/" className={buttonVariants({ className: "mt-5" })}>
          Retour à l&apos;accueil
        </Link>
      </div>
    </div>
  );
}
