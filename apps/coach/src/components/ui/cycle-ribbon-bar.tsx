"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatDayLong } from "@/lib/time.ts";
import { cn } from "@/lib/utils.ts";

export type RibbonDay = {
  day: string;
  code: string | null;
  colorVar: string;
  label: string;
  windowsSummary: string | null;
  hasActivity: boolean;
  isPlanned: boolean;
  isToday: boolean;
};

/**
 * Rendu interactif du ruban : découpé du chargement des données (fait par le
 * composant serveur `cycle-ribbon.tsx`) pour que seule cette petite partie —
 * survol, bascule mobile — embarque du JS client.
 *
 * Bascule 21 -> 14 jours sur mobile faite ICI plutôt que par deux requêtes
 * serveur différentes : les 21 jours sont déjà en mémoire, il suffit d'en
 * afficher un sous-ensemble centré sur aujourd'hui, plus tourné vers
 * l'avenir proche (ce qui reste consultable sur un petit écran) que vers le
 * passé.
 */
const MOBILE_PAST = 3;
const MOBILE_FUTURE = 10;

export function CycleRibbonBar({ days }: { days: RibbonDay[] }) {
  const [isMobile, setIsMobile] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    setIsMobile(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const todayIndex = days.findIndex((d) => d.isToday);
  const visible =
    isMobile && todayIndex >= 0
      ? days.slice(Math.max(0, todayIndex - MOBILE_PAST), todayIndex + MOBILE_FUTURE + 1)
      : days;

  return (
    <div className="relative select-none px-4 pt-2 md:px-6">
      <div className="flex h-5 items-end gap-px">
        {visible.map((d) => (
          <Link
            key={d.day}
            href={{ pathname: "/calendrier", query: { jour: d.day } }}
            onMouseEnter={() => setHovered(d.day)}
            onMouseLeave={() => setHovered((h) => (h === d.day ? null : h))}
            onFocus={() => setHovered(d.day)}
            onBlur={() => setHovered((h) => (h === d.day ? null : h))}
            className="group relative flex flex-1 flex-col items-center justify-end"
            aria-label={`${formatDayLong(d.day)} — ${d.label}`}
          >
            {d.hasActivity ? (
              <span
                className="mb-1 h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: "var(--color-text)" }}
                aria-hidden
              />
            ) : d.isPlanned ? (
              <span
                className="mb-1 h-1.5 w-1.5 shrink-0 rounded-full border"
                style={{ borderColor: "var(--color-muted)" }}
                aria-hidden
              />
            ) : (
              <span className="mb-1 h-1.5 w-1.5 shrink-0" aria-hidden />
            )}
            <span
              className={cn(
                "h-2 w-full rounded-[1px] transition-[filter] duration-[var(--duration-fast)]",
                "group-hover:brightness-125 group-focus-visible:brightness-125",
              )}
              style={{ backgroundColor: d.colorVar }}
            />
            {d.isToday ? (
              <span
                className="absolute -top-1 bottom-0 w-px"
                style={{ backgroundColor: "var(--color-signal)" }}
                aria-hidden
              />
            ) : null}

            {hovered === d.day ? (
              <div
                role="tooltip"
                className="tabular pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 w-max -translate-x-1/2 rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[11px] shadow-[var(--shadow-elevated)]"
              >
                <div className="font-medium capitalize">{formatDayLong(d.day)}</div>
                <div className="text-[var(--color-muted)]">
                  {d.label}
                  {d.windowsSummary ? ` · ${d.windowsSummary}` : ""}
                </div>
                {d.hasActivity ? <div className="text-[var(--color-text)]">Séance réalisée</div> : null}
                {!d.hasActivity && d.isPlanned ? (
                  <div className="text-[var(--color-muted)]">Séance prévue, pas encore faite</div>
                ) : null}
              </div>
            ) : null}
          </Link>
        ))}
      </div>
    </div>
  );
}
