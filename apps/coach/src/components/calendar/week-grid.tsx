import Link from "next/link";
import { Check } from "lucide-react";
import { ActivityTypeIcon, sportColor } from "@/components/activities/activity-icon.tsx";
import { cn } from "@/lib/utils.ts";
import { minutesToTime, weekdayLabel } from "@/lib/shifts/day.ts";
import type { ShiftTiming } from "@/lib/shifts/types.ts";
import type { CalendarDay } from "./month-grid.tsx";

/**
 * Vue semaine : répond à « quand est-ce que je m'entraîne cette semaine ? »
 * — les créneaux RÉELLEMENT disponibles (computeDayAvailability), pas une
 * grille horaire décorative. Une carte par jour plutôt qu'une frise horaire :
 * plus lisible sur mobile, et les créneaux d'un même jour se chevauchent
 * rarement assez pour justifier un axe temps commun.
 */
export function WeekGrid({ days, timings }: { days: CalendarDay[]; timings: ShiftTiming[] }) {
  const byCode = new Map(timings.map((t) => [t.code, t]));

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-7">
      {days.map((d) => {
        const timing = d.code ? byCode.get(d.code) : undefined;
        return (
          <div
            key={d.day}
            className={cn(
              "rounded-[var(--radius-card)] border bg-[var(--color-surface)] p-2.5",
              d.isToday ? "border-[var(--color-signal)]" : "border-[var(--color-border)]",
            )}
          >
            <div className="flex items-center justify-between">
              <span
                className={cn(
                  "tabular text-xs capitalize",
                  d.isToday
                    ? "font-semibold text-[var(--color-signal)]"
                    : d.isPast
                      ? "text-[var(--color-faint)]"
                      : "text-[var(--color-text)]",
                )}
              >
                {weekdayLabel(d.day)} {Number(d.day.slice(8, 10))}
              </span>
              {d.code ? (
                <span
                  className="rounded px-1 text-[9px] font-semibold leading-4 text-white"
                  style={{ backgroundColor: timing?.color ?? "#64748b" }}
                >
                  {d.code}
                </span>
              ) : (
                <span className="text-[9px] text-[var(--color-faint)]">repos</span>
              )}
            </div>

            <div className="mt-2 space-y-1">
              {d.windows.length === 0 ? (
                <p className="text-[10px] text-[var(--color-faint)]">Aucun créneau exploitable.</p>
              ) : (
                d.windows.map((w, i) => (
                  <div
                    key={i}
                    className="tabular rounded-[6px] px-1.5 py-1 text-[10px] leading-4"
                    style={{
                      backgroundColor: "color-mix(in oklab, var(--color-ok) 14%, transparent)",
                      color: "var(--color-ok)",
                    }}
                  >
                    {minutesToTime(w.startMin)}–{minutesToTime(w.endMin)} · {(w.durationMin / 60).toFixed(1)} h
                    {!w.allowsQuality ? " · endurance seule" : ""}
                  </div>
                ))
              )}
            </div>

            {d.planned.length > 0 || d.activities.length > 0 ? (
              <div className="mt-2 space-y-1 border-t border-[var(--color-border)] pt-2">
                {d.planned.map((p) => (
                  <p
                    key={p.id}
                    className={cn(
                      "truncate text-[10px]",
                      p.status === "done"
                        ? "text-[var(--color-ok)]"
                        : p.isProvisional
                          ? "text-[var(--color-faint)]"
                          : "text-[var(--color-text)]",
                    )}
                  >
                    {p.isKeySession ? "★ " : ""}
                    {p.title}
                  </p>
                ))}
                {d.activities.map((a) => (
                  <Link
                    key={a.id}
                    href={{ pathname: `/activites/${a.id}` }}
                    className="flex items-center gap-1 truncate text-[10px] hover:underline"
                    style={{ color: sportColor(a.type) }}
                  >
                    <ActivityTypeIcon type={a.type} size={9} />
                    {a.name}
                    <Check size={9} className="shrink-0" aria-hidden />
                  </Link>
                ))}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
