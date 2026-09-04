"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { cn } from "@/lib/utils.ts";
import { formatDayShort } from "@/lib/time.ts";
import {
  buildRibbonAriaLabel,
  buildRibbonTooltip,
  isVisibleOnMobile,
  shiftColorVar,
  type CycleRibbonDay,
} from "./cycle-ribbon-logic.ts";

/**
 * L'OBJET LE PLUS IMPORTANT DE L'APPLICATION (consigne de refonte) : bande de
 * 21 jours glissants (14 sur mobile), un segment par jour coloré par poste,
 * un marqueur d'activité en dessous, aujourd'hui cerclé d'ambre. Persistant
 * en haut de l'accueil, du calendrier et de la progression.
 *
 * `days` DOIT contenir exactement 7 jours passés + aujourd'hui + 13 à venir
 * (21 au total), dans l'ordre chronologique, avec exactement un `isToday`.
 * C'est à l'appelant de construire ce tableau depuis `loadShiftRange` — le
 * composant reste un pur habillage, pas une source de données.
 */
export function CycleRibbon({ days, className }: { days: CycleRibbonDay[]; className?: string }) {
  const todayIndex = days.findIndex((d) => d.isToday);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const refs = useRef<Array<HTMLAnchorElement | null>>([]);

  function focusIndex(i: number) {
    const el = refs.current[i];
    if (el) el.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, i: number) {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      focusIndex(Math.min(days.length - 1, i + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      focusIndex(Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      focusIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusIndex(days.length - 1);
    }
  }

  if (days.length === 0 || todayIndex === -1) return null;

  return (
    <div className={className}>
      <ul role="list" className="flex items-end gap-[2px]">
        {days.map((d, i) => {
          const indexFromToday = i - todayIndex;
          const color = shiftColorVar(d.code);
          const visibleOnMobile = isVisibleOnMobile(indexFromToday);
          return (
            <li
              key={d.day}
              className={cn("relative min-w-0 flex-1", !visibleOnMobile && "hidden sm:block")}
            >
              <Link
                ref={(el) => {
                  refs.current[i] = el;
                }}
                href={{ pathname: "/calendrier", query: { m: d.day.slice(0, 7), jour: d.day } }}
                aria-label={buildRibbonAriaLabel(d)}
                title={buildRibbonTooltip(d)}
                onKeyDown={(e) => onKeyDown(e, i)}
                onMouseEnter={() => setActiveIndex(i)}
                onMouseLeave={() => setActiveIndex(null)}
                onFocus={() => setActiveIndex(i)}
                onBlur={() => setActiveIndex(null)}
                className="flex flex-col items-center gap-1 rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4"
              >
                <span
                  className="block h-2 w-full rounded-[2px]"
                  style={{
                    backgroundColor: color,
                    outline: d.isToday ? "2px solid var(--color-signal)" : undefined,
                    outlineOffset: d.isToday ? 1 : undefined,
                  }}
                />
                <span className="flex h-[9px] w-[9px] items-center justify-center">
                  {d.hasActivity ? (
                    <span className="block h-[9px] w-[9px] rounded-full bg-[var(--color-text)]" />
                  ) : d.hasPlannedUndone ? (
                    <span className="block h-[7px] w-[7px] rounded-full border-[1.5px] border-[var(--color-muted)]" />
                  ) : null}
                </span>
              </Link>

              {activeIndex === i ? (
                <div
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 w-max max-w-[220px] -translate-x-1/2 rounded-[var(--radius-card)] border border-[var(--color-border-strong)] bg-[var(--color-surface-2)] px-2.5 py-1.5 text-[11px] leading-snug text-[var(--color-text)] shadow-[var(--shadow-elevated)]"
                >
                  {buildRibbonTooltip(d)}
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <div className="mt-1.5 flex items-baseline justify-between text-[11px] text-[var(--color-faint)]">
        <span>{formatDayShort(days[0]!.day)}</span>
        <span className="font-medium text-[var(--color-signal)]">aujourd&apos;hui</span>
        <span>{formatDayShort(days[days.length - 1]!.day)}</span>
      </div>
    </div>
  );
}
