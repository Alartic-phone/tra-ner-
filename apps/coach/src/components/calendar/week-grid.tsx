"use client";

import { Flag } from "lucide-react";
import { minutesToTime } from "@/lib/shifts/day.ts";
import { cn } from "@/lib/utils.ts";
import type { ShiftTiming } from "@/lib/shifts/types.ts";
import type { CalendarDay } from "./calendar-view.tsx";
import { SessionPill, mergeDaySessions, type SessionItem } from "./session-pill.tsx";

/** Séances dont l'heure réelle est connue : une activité, ou une séance
 * planifiée rapprochée d'une activité réalisée. Jamais une séance encore à
 * venir, qui n'a pas d'heure — cf. commentaire plus bas. */
function hasKnownTime(
  s: SessionItem,
): s is Extract<SessionItem, { kind: "done" | "activity" }> {
  return s.kind !== "planned";
}

const WEEKDAY_LABELS = ["lun.", "mar.", "mer.", "jeu.", "ven.", "sam.", "dim."];
const AXIS_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];
const TIMELINE_HEIGHT_PX = 480;

/**
 * Vue semaine : répond à « quand est-ce que je m'entraîne cette semaine ? ».
 * Chaque colonne trace les créneaux réellement disponibles (calculés par
 * `availability.ts`, jamais recalculés ici) en vert très transparent, et les
 * activités réalisées à leur heure réelle de départ. Une séance planifiée qui
 * n'a pas encore eu lieu n'a pas d'heure connue : elle n'est jamais placée sur
 * l'axe, elle reste listée sous la colonne.
 */
export function WeekGrid({
  days,
  timings,
  today,
  isSelected,
  onDayClick,
}: {
  days: CalendarDay[];
  timings: ShiftTiming[];
  today: string;
  isSelected: (day: string) => boolean;
  onDayClick: (day: string) => void;
}) {
  const byCode = new Map(timings.map((t) => [t.code, t]));

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--color-border)]">
      {/* En-têtes de colonne : jour, numéro, poste. */}
      <div className="grid grid-cols-[2.25rem_repeat(7,1fr)] border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div />
        {days.map((d, i) => {
          const timing = d.code ? byCode.get(d.code) : undefined;
          return (
            <button
              key={d.day}
              type="button"
              onClick={() => onDayClick(d.day)}
              aria-label={`${WEEKDAY_LABELS[i]} ${d.day}`}
              className={cn(
                "flex flex-col items-center gap-1 border-l border-[var(--color-border)] px-1 py-2 text-center transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-2)]",
                isSelected(d.day) && "ring-2 ring-inset ring-[var(--color-accent)]",
              )}
            >
              <span className="flex items-center gap-0.5 text-[10px] text-[var(--color-muted)]">
                {d.isRaceDay ? (
                  <Flag size={9} className="text-[var(--color-warn)]" aria-hidden />
                ) : null}
                {WEEKDAY_LABELS[i]}
              </span>
              <span
                className={cn(
                  "tabular flex h-5 w-5 items-center justify-center rounded-full text-xs",
                  d.isToday
                    ? "bg-[var(--color-accent)] font-semibold text-[#06101f]"
                    : d.isPast
                      ? "text-[var(--color-faint)]"
                      : "text-[var(--color-text)]",
                )}
              >
                {Number(d.day.slice(8, 10))}
              </span>
              {timing ? (
                <span
                  className="rounded px-1 text-[9px] font-semibold leading-4 text-white"
                  style={{ backgroundColor: timing.color ?? "#64748b" }}
                >
                  {timing.code}
                </span>
              ) : (
                <span className="text-[9px] text-[var(--color-faint)]">repos</span>
              )}
            </button>
          );
        })}
      </div>

      {/* Axe horaire + colonnes de disponibilité. */}
      <div className="grid grid-cols-[2.25rem_repeat(7,1fr)]">
        <div className="relative" style={{ height: TIMELINE_HEIGHT_PX }}>
          {AXIS_HOURS.map((h) => (
            <span
              key={h}
              className="tabular absolute right-1 -translate-y-1/2 text-[9px] text-[var(--color-faint)]"
              style={{ top: `${(h / 24) * 100}%` }}
            >
              {String(h).padStart(2, "0")}h
            </span>
          ))}
        </div>

        {days.map((d) => {
          const sessions = mergeDaySessions(d);
          const timed = sessions.filter(hasKnownTime);

          return (
            <div
              key={d.day}
              className="relative border-l border-[var(--color-border)]"
              style={{ height: TIMELINE_HEIGHT_PX }}
            >
              {AXIS_HOURS.map((h) => (
                <span
                  key={h}
                  className="absolute inset-x-0 border-t border-[var(--color-border)]/60"
                  style={{ top: `${(h / 24) * 100}%` }}
                  aria-hidden
                />
              ))}

              {/* Créneaux disponibles : vert très transparent, tel que
                  calculé par availability.ts — jamais une estimation. */}
              {d.windows.map((w, i) => (
                <span
                  key={i}
                  className="absolute inset-x-0.5 rounded-sm bg-[var(--color-ok)]/10"
                  style={{
                    top: `${(w.startMin / 1440) * 100}%`,
                    height: `${((w.endMin - w.startMin) / 1440) * 100}%`,
                  }}
                  aria-hidden
                />
              ))}

              {timed.map((s) => {
                const startMin = s.kind === "activity" ? s.startMin : s.activity?.startMin;
                if (startMin == null) return null;
                return (
                  <div
                    key={`${s.kind}-${s.id}`}
                    className="absolute inset-x-0.5"
                    style={{ top: `${(startMin / 1440) * 100}%` }}
                    title={minutesToTime(startMin)}
                  >
                    <SessionPill item={s} />
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Séances planifiées non encore réalisées : pas d'heure connue, donc
          jamais positionnées sur l'axe — listées sous la colonne. */}
      <div className="grid grid-cols-[2.25rem_repeat(7,1fr)] border-t border-[var(--color-border)] bg-[var(--color-surface)]">
        <div />
        {days.map((d) => {
          const untimed = mergeDaySessions(d).filter((s) => s.kind === "planned");
          return (
            <div key={d.day} className="space-y-0.5 border-l border-[var(--color-border)] p-1">
              {untimed.map((s) => (
                <SessionPill key={`${s.kind}-${s.id}`} item={s} />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
