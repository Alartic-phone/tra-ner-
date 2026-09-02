import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils.ts";

export function Badge({
  children,
  tone = "neutral",
  className,
  title,
  style,
}: {
  children: ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "info";
  className?: string;
  title?: string;
  /** Couleur ponctuelle (ex. teinte de sport) — remplace `tone` quand fourni. */
  style?: CSSProperties;
}) {
  const tones = {
    neutral: "border-[var(--color-border-strong)] text-[var(--color-muted)]",
    ok: "border-[var(--color-ok)]/40 text-[var(--color-ok)]",
    warn: "border-[var(--color-warn)]/40 text-[var(--color-warn)]",
    danger: "border-[var(--color-danger)]/40 text-[var(--color-danger)]",
    info: "border-[var(--color-info)]/40 text-[var(--color-info)]",
  } as const;

  return (
    <span
      title={title}
      style={style}
      className={cn(
        "inline-flex items-center rounded-[var(--radius-pill)] border px-2 py-0.5 text-[11px] leading-4",
        !style && tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Affichage normalisé d'une donnée absente. Jamais de valeur inventée. */
export function Unavailable({ reason }: { reason?: string }) {
  return (
    <span className="text-[var(--color-faint)]" title={reason ?? "Donnée non collectée"}>
      non disponible
    </span>
  );
}
