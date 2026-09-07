/**
 * Tous les tracés de la période superposés. Composant le plus coûteux des
 * sept : le SVG est généré CÔTÉ SERVEUR et mis en cache disque
 * (lib/trace-atlas-repository.ts) — ce composant se contente de le poser,
 * jamais recalculé au rendu client.
 */
export function TraceAtlas({ svg, className }: { svg: string | null; className?: string }) {
  if (!svg) {
    return (
      <p className={`text-sm text-[var(--color-muted)] ${className ?? ""}`}>
        L&apos;atlas apparaîtra après quelques sorties de plus.
      </p>
    );
  }

  return (
    <div
      className={className}
      style={{
        // Fond TOUJOURS sombre, indépendant du thème clair/sombre de l'app :
        // les tracés sont superposés en `mix-blend-mode:screen`
        // (lib/trace-atlas.ts), une technique qui n'éclaire que sur un fond
        // proche du noir — sur le thème clair, les traits deviennent quasi
        // invisibles si ce fond suit `--color-bg`. Valeur du thème sombre,
        // en dur : ce panneau est une carte-radar, pas une surface d'appli.
        backgroundColor: "#0e1a17",
        borderRadius: "var(--radius-card)",
      }}
      // Marqué de confiance : `svg` vient exclusivement de buildAtlasSvg
      // (lib/trace-atlas.ts), qui n'interpole aucune entrée utilisateur dans
      // le balisage — seules des coordonnées numériques calculées.
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
