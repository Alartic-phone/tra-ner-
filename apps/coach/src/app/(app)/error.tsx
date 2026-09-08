"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button, buttonVariants } from "@/components/ui/button.tsx";
import { isStaleDeploymentError } from "@/lib/stale-deployment.ts";

/**
 * Erreur applicative dans le design de l'app plutôt que l'overlay générique
 * de Next.js (audit fonctionnel du 07/09/2026 : aucun `error.tsx` nulle
 * part dans `src/app`).
 *
 * Un bundle client périmé après redéploiement (chunk disparu, Server Action
 * dont l'identifiant a changé) n'est pas réparable par "Réessayer" — il faut
 * un rechargement complet pour récupérer le nouveau JavaScript, d'où un
 * message et une action dédiés plutôt que le message d'erreur générique.
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

  const stale = isStaleDeploymentError(error);

  return (
    <div className="mx-auto max-w-[1100px] p-4 md:p-6">
      <div className="mt-10 text-center">
        <p className="font-display text-2xl text-[var(--color-text)]">
          {stale ? "Nouvelle version disponible" : "Une erreur est survenue"}
        </p>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          {stale
            ? "Cette page a été chargée avant le dernier déploiement — recharger pour continuer."
            : "La page n'a pas pu s'afficher correctement."}
        </p>
        <div className="mt-5 flex items-center justify-center gap-3">
          {stale ? (
            <Button onClick={() => window.location.reload()}>Recharger la page</Button>
          ) : (
            <>
              <Button onClick={reset}>Réessayer</Button>
              <Link href="/" className={buttonVariants({ variant: "outline" })}>
                Retour à l&apos;accueil
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
