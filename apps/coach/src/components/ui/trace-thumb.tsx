import { ActivityTypeIcon, sportColor } from "@/components/activities/activity-icon.tsx";

/**
 * Vignette de tracé GPS : SVG STATIQUE (lib/trace.ts, mis en cache en base —
 * `getTracePath`/`getTracePathsByActivity`, metrics/repository.ts), jamais
 * une instance MapLibre par ligne. Sans GPS : icône du sport sur aplat teinté.
 */
export function TraceThumb({
  tracePath,
  type,
  size = 80,
  className,
}: {
  /** Chemin `d` déjà calculé (boîte 100×100), ou `null` sans GPS. */
  tracePath: string | null;
  /** Type d'activité brut, pour l'icône/couleur de repli. */
  type: string;
  size?: number;
  className?: string;
}) {
  const color = sportColor(type);

  if (!tracePath) {
    return (
      <span
        aria-hidden
        className={className}
        style={{
          width: size,
          height: size,
          borderRadius: "var(--radius-card)",
          backgroundColor: `color-mix(in oklab, ${color} 18%, transparent)`,
          color,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityTypeIcon type={type} size={Math.round(size * 0.4)} />
      </span>
    );
  }

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      style={{ display: "block" }}
    >
      <path
        d={tracePath}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
