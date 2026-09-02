/**
 * Vignette de tracé — usage fil de liste (Accueil, Activités, Progression).
 *
 * Composant SERVEUR, statique, sans animation : lit `tracePath`/`traceViewBox`
 * déjà mis en cache par `lib/trace.ts` à l'import (`strava/sync.ts`,
 * `import-coros-fit.ts`), jamais une instance MapLibre ni une décompression
 * de flux par ligne. L'animation de dessin est réservée à la page activité
 * (une seule animation remarquable par écran, cf. lib/motion.ts) : ici le
 * tracé apparaît déjà formé.
 */
export function TraceThumbnail({
  tracePath,
  traceViewBox,
  className,
  strokeWidth = 1.5,
}: {
  tracePath: string | null;
  traceViewBox: string | null;
  className?: string;
  strokeWidth?: number;
}) {
  if (!tracePath || !traceViewBox) return null;

  return (
    <svg viewBox={traceViewBox} className={className} aria-hidden="true">
      <path
        d={tracePath}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
