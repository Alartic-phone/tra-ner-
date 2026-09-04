/**
 * Mini-tendance SVG pure, 40×16 — pas de Recharts pour ce format : la
 * dépendance est disproportionnée pour une dizaine de points dans une carte
 * de liste. Un trou dans `values` (capteur muet) coupe le tracé au lieu de
 * l'interpoler : relier deux points de part et d'autre d'un `null`
 * fabriquerait une mesure qui n'existe pas.
 */
export function Sparkline({
  values,
  color = "var(--color-accent)",
  className,
}: {
  values: (number | null)[];
  color?: string;
  className?: string;
}) {
  const width = 40;
  const height = 16;

  const known = values.filter((v): v is number => v != null);
  if (known.length < 2) return null; // Rien de significatif à tracer.

  const min = Math.min(...known);
  const max = Math.max(...known);
  const range = max - min || 1;
  const stepX = width / (values.length - 1);

  // Segments contigus : une valeur manquante ferme le segment en cours
  // plutôt que d'être comblée.
  const segments: { x: number; y: number }[][] = [];
  let current: { x: number; y: number }[] = [];
  for (const [i, v] of values.entries()) {
    if (v == null) {
      if (current.length) segments.push(current);
      current = [];
      continue;
    }
    current.push({ x: i * stepX, y: height - ((v - min) / range) * height });
  }
  if (current.length) segments.push(current);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
    >
      {segments.map((segment, i) => (
        <polyline
          key={i}
          points={segment.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
