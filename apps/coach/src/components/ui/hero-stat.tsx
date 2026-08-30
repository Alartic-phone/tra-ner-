import type { ReactNode } from "react";
import { cn } from "@/lib/utils.ts";

/**
 * Remplace les <Stat size="lg"|"xl"> improvisés pour LE chiffre hero d'une
 * page (distance, allure, FC…) : échelle @theme dédiée (--text-hero-*, ratio
 * constant ×1.5) plutôt que les tailles de texte génériques, et son propre
 * chrome de carte (bordure en dégradé + halo sport optionnel, `.hero-stat-card`
 * dans globals.css) — il ne s'agit pas d'une Card, ce niveau de mise en avant
 * ne doit exister nulle part ailleurs dans l'app.
 */

const SPORT_VARS = {
  run: "--sport-run",
  ride: "--sport-ride",
  swim: "--sport-swim",
  other: "--sport-other",
} as const;

const TONE_VARS = {
  default: "var(--color-text)",
  ok: "var(--color-ok)",
  warn: "var(--color-warn)",
  danger: "var(--color-danger)",
} as const;

const SIZE_CLASSES = {
  md: "text-hero-md",
  lg: "text-hero-lg",
  xl: "text-hero-xl",
} as const;

export function HeroStat({
  value,
  unit,
  label,
  estimated = false,
  size = "lg",
  tone = "default",
  sport,
  className,
}: {
  value: ReactNode;
  unit?: string;
  label: string;
  /** Valeur obtenue par approximation — jamais une estimation silencieuse. */
  estimated?: boolean;
  size?: keyof typeof SIZE_CLASSES;
  tone?: keyof typeof TONE_VARS;
  /** Halo très discret en haut à gauche — jamais un fond plein. */
  sport?: keyof typeof SPORT_VARS;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "hero-stat-card relative overflow-hidden rounded-[var(--radius-card)] p-4",
        className,
      )}
      style={
        sport
          ? ({
              "--hero-sport-halo": `radial-gradient(120% 100% at 0% 0%, color-mix(in oklab, var(${SPORT_VARS[sport]}) 30%, transparent) 0%, transparent 55%)`,
            } as React.CSSProperties)
          : undefined
      }
    >
      <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
        <span>{label}</span>
        {estimated ? (
          <span
            title="Valeur estimée, pas mesurée"
            className="rounded-[var(--radius-pill)] border border-[var(--color-border-strong)] px-1 text-[10px] leading-4 text-[var(--color-warn)]"
          >
            est.
          </span>
        ) : null}
      </div>
      <div className="tabular mt-1 flex items-baseline gap-1.5">
        <span
          className={cn(
            SIZE_CLASSES[size],
            "font-[family-name:var(--font-display)] font-bold",
          )}
          style={{ color: TONE_VARS[tone] }}
        >
          {value}
        </span>
        {unit ? <span className="text-sm text-[var(--color-muted)]">{unit}</span> : null}
      </div>
    </div>
  );
}
