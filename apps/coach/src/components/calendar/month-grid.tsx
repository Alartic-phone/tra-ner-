"use client";

import { Fragment } from "react";
import { AlertTriangle, Flag, Moon } from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { formatDayLong } from "@/lib/time.ts";
import type { ShiftTiming } from "@/lib/shifts/types.ts";
import type { CalendarDay } from "./calendar-view.tsx";
import { SessionPill, mergeDaySessions } from "./session-pill.tsx";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Vue mensuelle superposant postes, séances planifiées et séances réalisées.
 *
 * Le poste du jour est un bandeau plein de 4 px en haut de la case (repos =
 * pas de bandeau) : la rythmique du cycle se lit d'un regard sur toute la
 * grille. Un jour passé garde tout son contraste, seul le numéro du jour est
 * atténué — sinon l'historique récent devient illisible.
 */
export function MonthGrid({
  days,
  timings,
  isSelected,
  isRangeAnchor,
  onDayClick,
}: {
  days: CalendarDay[];
  timings: ShiftTiming[];
  isSelected: (day: string) => boolean;
  isRangeAnchor: (day: string) => boolean;
  onDayClick: (day: string) => void;
}) {
  const byCode = new Map(timings.map((t) => [t.code, t]));

  // La grille livre toujours des semaines complètes (lundi à dimanche,
  // cf. `gridFrom`/`gridTo` côté page) : le découpage par tranches de 7 est
  // donc sûr, et sert à accoler un résumé de semaine sous chaque rangée.
  const weeks: CalendarDay[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-border)]">
      {WEEKDAYS.map((label, i) => (
        <div
          key={i}
          className="bg-[var(--color-surface)] py-1.5 text-center text-[11px] text-[var(--color-muted)]"
        >
          {label}
        </div>
      ))}

      {weeks.map((week, wi) => (
        <Fragment key={wi}>
          {week.map((d) => {
            const timing = d.code ? byCode.get(d.code) : undefined;
            const selected = isSelected(d.day);
            const rangeAnchor = isRangeAnchor(d.day);
            const sessions = mergeDaySessions(d);

            return (
              <button
                key={d.day}
                type="button"
                onClick={() => onDayClick(d.day)}
                aria-label={`${formatDayLong(d.day)} — ${timing?.label ?? "repos"}${d.isRaceDay ? " — jour de course" : ""}`}
                className={cn(
                  "relative min-h-[74px] overflow-hidden bg-[var(--color-surface)] p-1 pt-2 text-left transition-colors md:min-h-[96px]",
                  !d.inMonth && "opacity-40",
                  (selected || rangeAnchor) && "ring-2 ring-inset ring-[var(--color-accent)]",
                  d.isRaceDay && "ring-1 ring-inset ring-[var(--color-warn)]",
                  "hover:bg-[var(--color-surface-2)]",
                )}
              >
                {/* Bandeau de poste en bandeau plein : repos = rien, pour que
                    le regard distingue immédiatement travail et repos sans
                    lire le code. */}
                {timing ? (
                  <span
                    className="absolute inset-x-0 top-0 h-1"
                    style={{ backgroundColor: timing.color ?? "#64748b" }}
                    aria-hidden
                  />
                ) : null}

                <div className="flex items-start justify-between gap-1">
                  <span
                    className={cn(
                      "tabular flex items-center gap-1 text-[11px]",
                      d.isToday
                        ? "rounded bg-[var(--color-accent)] px-1 font-semibold text-[#06101f]"
                        : d.isPast
                          ? "text-[var(--color-faint)]"
                          : "text-[var(--color-text)]",
                    )}
                  >
                    {d.isRaceDay ? (
                      <Flag size={10} className="text-[var(--color-warn)]" aria-hidden />
                    ) : null}
                    {Number(d.day.slice(8, 10))}
                  </span>
                  {timing ? (
                    <span
                      className="rounded px-1 text-[10px] font-semibold leading-4 text-white"
                      style={{ backgroundColor: timing.color ?? "#64748b" }}
                      title={timing.label}
                    >
                      {timing.code}
                    </span>
                  ) : null}
                </div>

                {d.isException ? (
                  <div className="mt-0.5 flex items-center gap-0.5 text-[9px] text-[var(--color-warn)]">
                    <AlertTriangle size={9} aria-hidden />
                    {d.isReplacement ? "remplacement" : d.isFreed ? "libéré" : "modifié"}
                  </div>
                ) : null}

                <div className="mt-1 space-y-0.5">
                  {sessions.map((s) => (
                    <SessionPill key={`${s.kind}-${s.id}`} item={s} />
                  ))}
                </div>

                {!d.allowsLongRun && d.code === null ? (
                  <Moon
                    size={9}
                    className="absolute bottom-1 right-1 text-[var(--color-faint)]"
                    aria-label="Sortie longue impossible ce jour"
                  />
                ) : null}
              </button>
            );
          })}

          {week[0]?.weeklyVolumeTargetKm != null ? (
            <WeekSummary week={week} targetKm={week[0].weeklyVolumeTargetKm} />
          ) : null}
        </Fragment>
      ))}
    </div>
  );
}

/**
 * Résumé de semaine, sous la rangée : volume réalisé face au volume cible de
 * la phase de plan active. N'apparaît que si un plan chiffre réellement une
 * cible pour cette semaine — jamais de cible affichée par défaut.
 */
function WeekSummary({ week, targetKm }: { week: CalendarDay[]; targetKm: number }) {
  const realizedKm =
    week.reduce((sum, d) => sum + d.activities.reduce((s, a) => s + a.distanceM, 0), 0) / 1000;
  const pct = Math.min(100, Math.round((realizedKm / targetKm) * 100));

  return (
    <div className="col-span-7 flex items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1">
      <span className="h-1 flex-1 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-surface-2)]">
        <span
          className="block h-1 rounded-[var(--radius-pill)] bg-[var(--color-info)]"
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="tabular whitespace-nowrap text-[10px] text-[var(--color-faint)]">
        {realizedKm.toFixed(0)} / {targetKm.toFixed(0)} km — semaine de plan
      </span>
    </div>
  );
}
