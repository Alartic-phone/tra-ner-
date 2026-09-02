import Link from "next/link";
import { ActivityTypeIcon, sportColor } from "@/components/activities/activity-icon.tsx";
import { weekdayLabel, type Day } from "@/lib/shifts/day.ts";
import { formatDayShort, toMinutesOfDay } from "@/lib/time.ts";
import { cn, formatDistance } from "@/lib/utils.ts";
import type { ShiftTiming } from "@/lib/shifts/types.ts";

export type WeekDayData = {
  day: Day;
  code: string | null;
  isToday: boolean;
  /** Créneaux disponibles, en minutes depuis minuit — affichés en fond. */
  windows: Array<{ startMin: number; endMin: number }>;
  activities: Array<{ id: string; name: string; type: string; startMin: number; movingTimeS: number; distanceM: number }>;
};

const HOUR_HEIGHT = 22; // px par heure
const DAY_HEIGHT = HOUR_HEIGHT * 24;
const AXIS_HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

/**
 * Vue semaine : les créneaux disponibles en fond (bande translucide), le
 * poste du jour en bandeau plein, les activités positionnées à leur heure
 * réelle de départ — une vraie lecture du planning, complémentaire de la
 * vue mois qui priorise la densité sur trente jours.
 */
export function WeekGrid({ days, timings }: { days: WeekDayData[]; timings: ShiftTiming[] }) {
  const byCode = new Map(timings.map((t) => [t.code, t]));

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-[640px] grid-cols-[40px_repeat(7,1fr)] gap-px overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-border)]">
        <div className="bg-[var(--color-surface)]" />
        {days.map((d) => (
          <div
            key={d.day}
            className={cn(
              "bg-[var(--color-surface)] py-1.5 text-center text-[11px]",
              d.isToday ? "font-semibold text-[var(--color-text)]" : "text-[var(--color-muted)]",
            )}
          >
            <span className="capitalize">{weekdayLabel(d.day).slice(0, 3)}</span>{" "}
            <span className="tabular">{formatDayShort(d.day)}</span>
          </div>
        ))}

        {/* Axe des heures. */}
        <div className="relative bg-[var(--color-surface)]" style={{ height: DAY_HEIGHT }}>
          {AXIS_HOURS.map((h) => (
            <span
              key={h}
              className="tabular absolute right-1 -translate-y-1/2 text-[9px] text-[var(--color-faint)]"
              style={{ top: h * HOUR_HEIGHT }}
            >
              {String(h).padStart(2, "0")}h
            </span>
          ))}
        </div>

        {days.map((d) => {
          const timing = d.code ? byCode.get(d.code) : undefined;
          let shiftBar: { top: number; height: number } | null = null;
          if (timing) {
            const start = timeToMin(timing.startTime);
            let end = timeToMin(timing.endTime);
            if (end <= start) end = 1440;
            shiftBar = { top: start * (HOUR_HEIGHT / 60), height: (end - start) * (HOUR_HEIGHT / 60) };
          }

          return (
            <div
              key={d.day}
              className="relative bg-[var(--color-surface)]"
              style={{ height: DAY_HEIGHT }}
            >
              {AXIS_HOURS.map((h) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-[var(--color-border)]"
                  style={{ top: h * HOUR_HEIGHT }}
                />
              ))}

              {/* Créneaux disponibles, en fond. */}
              {d.windows.map((w, i) => (
                <div
                  key={i}
                  className="absolute inset-x-0.5 rounded-sm bg-[var(--color-accent-soft)]"
                  style={{
                    top: w.startMin * (HOUR_HEIGHT / 60),
                    height: Math.max(2, (w.endMin - w.startMin) * (HOUR_HEIGHT / 60)),
                    opacity: 0.5,
                  }}
                  title={`Créneau libre ${minToTime(w.startMin)}–${minToTime(w.endMin)}`}
                />
              ))}

              {/* Poste du jour. */}
              {shiftBar ? (
                <div
                  className="absolute inset-x-0.5 rounded-sm"
                  style={{
                    top: shiftBar.top,
                    height: Math.max(3, shiftBar.height),
                    backgroundColor: timing?.color ?? "#64748b",
                    opacity: 0.85,
                  }}
                  title={timing?.label}
                />
              ) : null}

              {d.isToday ? (
                <div
                  className="absolute inset-x-0 h-px bg-[var(--color-signal)]"
                  style={{ top: toMinutesOfDay(new Date()) * (HOUR_HEIGHT / 60) }}
                />
              ) : null}

              {/* Activités, positionnées à leur heure réelle de départ. */}
              {d.activities.map((a) => (
                <Link
                  key={a.id}
                  href={{ pathname: `/activites/${a.id}` }}
                  className="absolute inset-x-1 flex items-center gap-1 truncate rounded-[3px] px-1 text-[9px] font-medium text-[#06101f] shadow-sm"
                  style={{
                    top: a.startMin * (HOUR_HEIGHT / 60),
                    height: Math.max(HOUR_HEIGHT * 0.8, (a.movingTimeS / 60) * (HOUR_HEIGHT / 60)),
                    backgroundColor: sportColor(a.type),
                  }}
                  title={`${a.name} — ${formatDistance(a.distanceM)}`}
                >
                  <ActivityTypeIcon type={a.type} size={9} />
                  <span className="truncate">{formatDistance(a.distanceM)}</span>
                </Link>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function timeToMin(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function minToTime(min: number): string {
  const norm = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(norm / 60)).padStart(2, "0")}:${String(norm % 60).padStart(2, "0")}`;
}
