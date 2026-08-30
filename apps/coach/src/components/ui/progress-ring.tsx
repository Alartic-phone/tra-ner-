import type { ReactNode } from "react";

/**
 * Anneau de progression SVG pur — pas de dépendance, pas de logique métier.
 * `value` doit déjà être une fraction bornée [0, 1] calculée ailleurs (forme,
 * ratio aigu/chronique, confiance de prédiction…) : ce composant n'invente
 * jamais de sens, il habille un calcul qui existe déjà.
 *
 * L'animation de remplissage est en CSS pur (@keyframes ring-fill,
 * globals.css) : aucun JavaScript, donc pas besoin de "use client".
 */

const TONE_VARS = {
  default: "var(--color-accent)",
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  danger: "var(--color-danger)",
  info: "var(--color-info)",
} as const;

export function ProgressRing({
  value,
  size = 96,
  strokeWidth = 8,
  tone = "default",
  label,
  children,
}: {
  value: number;
  size?: number;
  strokeWidth?: number;
  tone?: keyof typeof TONE_VARS;
  label?: string;
  children?: ReactNode;
}) {
  const clamped = Math.max(0, Math.min(1, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped);

  return (
    <div className="inline-flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-border-strong)"
            strokeWidth={strokeWidth}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={TONE_VARS[tone]}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={
              {
                "--ring-circumference": circumference,
                animation: "ring-fill var(--duration-slow) var(--ease-standard) forwards",
              } as React.CSSProperties
            }
          />
        </svg>
        {children ? (
          <div className="absolute inset-0 flex items-center justify-center">{children}</div>
        ) : null}
      </div>
      {label ? (
        <span className="text-[11px] font-medium text-[var(--color-muted)]">{label}</span>
      ) : null}
    </div>
  );
}
