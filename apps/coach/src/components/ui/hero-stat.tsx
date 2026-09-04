import type { ReactNode } from "react";
import { cn } from "@/lib/utils.ts";
import { CountUp } from "./count-up.tsx";
import { Unavailable } from "./badge.tsx";

/**
 * LE chiffre hero d'un écran (distance, allure, FC…) : échelle @theme dédiée
 * (--text-hero-*) sur l'axe de largeur d'Archivo (.text-hero-number,
 * globals.css), pas les tailles de texte génériques. Son propre chrome de
 * carte (bordure en dégradé + halo sport optionnel, `.hero-stat-card`) — ce
 * niveau de mise en avant n'existe nulle part ailleurs dans l'app.
 *
 * `value` null -> <Unavailable />, JAMAIS 0 (R1). Le comptage 0->valeur ne
 * rejoue qu'au premier montage du composant (CountUp mémorise par instance) :
 * une navigation qui réutilise l'instance (retour arrière dans le cache du
 * routeur) ne relance pas l'animation ; un rechargement complet en est un
 * nouveau premier montage légitime.
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
  decimals = 0,
  estimated = false,
  size = "lg",
  tone = "default",
  sport,
  trend,
  reason,
  className,
}: {
  /** `null` = donnée absente : rend <Unavailable />, jamais 0. */
  value: number | null;
  unit?: string;
  label: string;
  decimals?: number;
  /** Valeur obtenue par approximation — jamais une estimation silencieuse. */
  estimated?: boolean;
  size?: keyof typeof SIZE_CLASSES;
  tone?: keyof typeof TONE_VARS;
  /** Halo très discret en haut à gauche — jamais un fond plein. */
  sport?: keyof typeof SPORT_VARS;
  /** Complément court sous la valeur (ex. "+12 % vs semaine dernière"). */
  trend?: ReactNode;
  /** Raison de l'absence, affichée par <Unavailable />. */
  reason?: string;
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

      {value === null ? (
        <div className="mt-1">
          <Unavailable reason={reason} />
        </div>
      ) : (
        <div className="mt-1 flex items-baseline gap-1.5">
          <span
            className={cn("text-hero-number", SIZE_CLASSES[size])}
            style={{ color: TONE_VARS[tone] }}
          >
            <CountUp value={value} decimals={decimals} />
          </span>
          {unit ? <span className="text-sm text-[var(--color-faint)]">{unit}</span> : null}
        </div>
      )}

      {trend ? <div className="mt-1 text-xs text-[var(--color-faint)]">{trend}</div> : null}
    </div>
  );
}
