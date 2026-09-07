"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button.tsx";

/**
 * Erreur applicative dans le design de l'app plutôt que l'overlay générique
 * de Next.js (audit fonctionnel du 07/09/2026 : aucun `error.tsx` nulle
 * part dans `src/app`).
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto max-w-[1100px] p-4 md:p-6">
      <div className="mt-10 text-center">
        <p className="font-display text-2xl text-[var(--color-text)]">Une erreur est survenue</p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          La page n&apos;a pas pu s&apos;afficher correctement.
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          <Button onClick={reset}>Réessayer</Button>
          <Link href="/" className={buttonVariants({ variant: "outline" })}>
            Retour à l&apos;accueil
          </Link>
        </div>
      </div>
    </div>
  );
}
