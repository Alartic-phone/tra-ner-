import { ActivityTypeIcon, sportColor } from "@/components/activities/activity-icon.tsx";
import { cn } from "@/lib/utils.ts";

type LatLng = readonly [number, number];

/** Réduit à ~maxPoints par prélèvement régulier — cf. `route-map.tsx`, même
 * logique, dupliquée volontairement : la vignette n'a besoin ni de
 * l'animation de tracé ni du repli MapLibre, seulement d'un <path> figé. */
function decimate<T>(points: readonly T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return [...points];
  const step = points.length / maxPoints;
  const out: T[] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(points[Math.floor(i * step)]!);
  }
  return out;
}

function project(points: readonly LatLng[]): Array<{ x: number; y: number }> {
  const avgLat = points.reduce((sum, [lat]) => sum + lat, 0) / points.length;
  const cosLat = Math.cos((avgLat * Math.PI) / 180);
  return points.map(([lat, lng]) => ({ x: lng * cosLat, y: -lat }));
}

/**
 * Vignette de tracé GPS figée (96×96 par défaut) — un simple `<path>` SVG
 * sans instance MapLibre : le fil d'activités peut afficher des dizaines de
 * lignes sans faire tourner autant de cartes interactives. Sans GPS (tapis,
 * muscu) : l'icône du sport sur fond teinté, jamais une vignette vide.
 */
export function RouteThumbnail({
  latlng,
  type,
  size = 96,
  className,
}: {
  latlng: ReadonlyArray<LatLng | null> | null;
  type: string;
  size?: number;
  className?: string;
}) {
  const color = sportColor(type);
  const valid = (latlng ?? []).filter((p): p is LatLng => p != null);

  if (valid.length < 2) {
    return (
      <span
        className={cn("flex shrink-0 items-center justify-center rounded-[var(--radius-card)]", className)}
        style={{
          width: size,
          height: size,
          backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
          color,
        }}
      >
        <ActivityTypeIcon type={type} size={Math.round(size * 0.34)} />
      </span>
    );
  }

  const projected = project(decimate(valid, 80));
  const xs = projected.map((p) => p.x);
  const ys = projected.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);

  const strokeWidth = Math.max(2, size / 40);
  const padding = strokeWidth * 2.5;
  const spanX = Math.max(maxX - minX, 1e-9);
  const spanY = Math.max(maxY - minY, 1e-9);
  const scale = Math.min((size - 2 * padding) / spanX, (size - 2 * padding) / spanY);

  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const pathD = projected
    .map((p, i) => {
      const x = size / 2 + (p.x - midX) * scale;
      const y = size / 2 + (p.y - midY) * scale;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className={cn("shrink-0 rounded-[var(--radius-card)] bg-[var(--color-surface-2)]", className)}
    >
      <path d={pathD} fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
