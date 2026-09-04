"use client";

import { useState, type ReactNode } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils.ts";
import type { PhotoManifestEntry } from "@/lib/photos.ts";
import { DUR } from "@/lib/motion.ts";

/**
 * Bandeau photo avec voile sombre et contenu en surimpression. Hauteur
 * réservée en style inline (jamais dépendante du chargement de l'image) :
 * aucun saut de mise en page, avec ou sans pack de photos.
 *
 * RÈGLES (voir aussi CLAUDE.md racine du sous-projet coach) :
 *  - aucun chiffre ne se pose directement sur une photo sans ce voile ;
 *  - jamais deux <PhotoHero /> visibles simultanément sur un même écran —
 *    c'est à l'appelant (une page) de le garantir, le composant ne peut pas
 *    le vérifier lui-même ;
 *  - tout le texte posé ici doit rester en --color-text (jamais --color-muted
 *    ni --color-faint) : DEFAULT_VEIL_ALPHA n'est vérifié par calcul
 *    (lib/contrast.ts, voir contrast.test.ts) que pour --color-text, pas pour
 *    un texte plus terne. La hiérarchie visuelle se fait par taille/graisse,
 *    pas par une couleur plus pâle, tant qu'on est sur la photo.
 */

/**
 * rgba(8,11,18, 0.62) — calculé, pas choisi à l'œil : contraste ≥ 4,5:1 pour
 * --color-text (#f2f5fa) même sur la zone la plus claire plausible d'une
 * photo (blanc). Verrouillé par un test (contrast.test.ts) : le relever à
 * 0.72 seulement si ce test casse après un changement de couleur.
 */
const DEFAULT_VEIL_ALPHA = 0.62;

export function PhotoHero({
  photo,
  height = 196,
  children,
  className,
}: {
  /** `null` = pack absent ou moment sans photo : aplat --color-surface, jamais d'image en ligne. */
  photo: PhotoManifestEntry | null;
  height?: number;
  children?: ReactNode;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  return (
    <div
      className={cn("relative overflow-hidden rounded-[var(--radius-card)]", className)}
      style={{ height }}
    >
      {photo ? (
        <>
          <div
            aria-hidden
            className="absolute inset-0 bg-cover bg-center"
            style={{
              backgroundImage: `url(${photo.blurDataUrl})`,
              opacity: loaded ? 0 : 1,
              transition: `opacity ${DUR.base}s var(--ease-standard)`,
            }}
          />
          <Image
            src={`/photos/${photo.file1600}`}
            alt=""
            fill
            sizes="(max-width: 1100px) 100vw, 1100px"
            className="object-cover"
            style={{ opacity: loaded ? 1 : 0, transition: `opacity ${DUR.base}s var(--ease-standard)` }}
            onLoad={() => setLoaded(true)}
            priority
          />
        </>
      ) : (
        <div aria-hidden className="absolute inset-0" style={{ background: "var(--color-surface)" }} />
      )}

      <div aria-hidden className="absolute inset-0" style={{ background: `rgba(8,11,18,${DEFAULT_VEIL_ALPHA})` }} />

      <div className="relative flex h-full flex-col justify-end p-4 text-[var(--color-text)] sm:p-6">
        {children}
      </div>
    </div>
  );
}
