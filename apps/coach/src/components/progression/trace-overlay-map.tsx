import type { OverlayMap } from "@/lib/trace.ts";

/**
 * Tous les tracés de l'année superposés dans le même espace de coordonnées
 * — un passage répété devient lumineux par simple accumulation de traits
 * translucides, sans aucun traitement d'image : c'est l'empilement naturel
 * de la transparence SVG sur un fond sombre. Statique, jamais animée : la
 * seule image « décorative » de l'app n'a pas besoin de l'être aussi en
 * mouvement.
 */
export function TraceOverlayMap({ overlay }: { overlay: OverlayMap }) {
  return (
    <svg viewBox={overlay.viewBox} className="h-auto w-full" role="img" aria-label="Tous les tracés de l'année, superposés">
      <rect x={0} y={0} width={overlay.width} height={overlay.height} fill="var(--color-bg)" />
      {overlay.paths.map((p, i) => (
        <path
          key={i}
          d={p.pathD}
          fill="none"
          stroke="var(--color-accent)"
          strokeWidth={1}
          strokeOpacity={0.12}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
