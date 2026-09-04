import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils.ts";

export function Card({
  className,
  elevated = false,
  interactive = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  /** Lueur de fond très discrète + ombre portée — réservé aux cartes hero. */
  elevated?: boolean;
  /** Léger effet au survol, pour les cartes qui sont aussi un lien. */
  interactive?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]",
        "transition-[transform,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-standard)]",
        elevated && "shadow-[var(--shadow-elevated)]",
        interactive && "hover:-translate-y-0.5 hover:border-[var(--color-border-strong)]",
        className,
      )}
      style={elevated ? { backgroundImage: "var(--surface-glow)" } : undefined}
      {...props}
    />
  );
}

export function CardHeader({
  title,
  action,
  hint,
}: {
  title: ReactNode;
  action?: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3">
      <div>
        <h2 className="text-sm font-medium">{title}</h2>
        {hint ? (
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">{hint}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4", className)} {...props} />;
}

/**
 * Tuile de métrique. `estimated` marque explicitement une valeur calculée par
 * approximation, `unavailable` une donnée absente : l'utilisateur doit
 * toujours savoir ce qui est mesuré et ce qui est estimé.
 */
export function Stat({
  label,
  value,
  unit,
  hint,
  estimated = false,
  tone = "default",
  size = "default",
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: string;
  estimated?: boolean;
  tone?: "default" | "ok" | "warn" | "danger";
  /**
   * "lg" = chiffre mis en avant dans une grille de plusieurs stats.
   * "xl" = LE chiffre hero de la page (façon Strava/Nike) — un seul par page.
   */
  size?: "default" | "lg" | "xl";
}) {
  const toneColor = {
    default: "var(--color-text)",
    ok: "var(--color-ok)",
    warn: "var(--color-warn)",
    danger: "var(--color-danger)",
  }[tone];

  return (
    <div className="px-4 py-3">
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
      <div className="tabular mt-1 flex items-baseline gap-1">
        <span
          className={
            size === "xl"
              ? "text-6xl font-bold"
              : size === "lg"
                ? "text-4xl font-semibold"
                : "text-xl font-semibold"
          }
          style={{ color: toneColor }}
        >
          {value}
        </span>
        {unit ? (
          <span className="text-xs text-[var(--color-muted)]">{unit}</span>
        ) : null}
      </div>
      {hint ? (
        <div className="mt-0.5 text-[11px] text-[var(--color-faint)]">{hint}</div>
      ) : null}
    </div>
  );
}
