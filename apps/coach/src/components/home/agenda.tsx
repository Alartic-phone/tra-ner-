import { SectionTitle } from "./section-title.tsx";
import { formatDayShort } from "@/lib/time.ts";
import type { AgendaDay } from "@/lib/home-repository.ts";

/**
 * Sept prochains jours (section 3.5), remplace l'ancien ruban de cycle. Les
 * postes viennent de lib/shifts, les séances du plan — un jour de repos le
 * dit explicitement, jamais une case vide ambiguë.
 */
export function Agenda({ days }: { days: readonly AgendaDay[] }) {
  return (
    <section>
      <SectionTitle href="/calendrier" destination="calendrier">
        Agenda
      </SectionTitle>
      <ul className="mt-3 divide-y divide-[var(--color-border)]">
        {days.map((d) => (
          <li
            key={d.day}
            className={`flex items-center gap-3 py-2 text-sm ${d.isToday ? "text-[var(--color-text)]" : "text-[var(--color-muted)]"}`}
          >
            <span
              className="tabular w-14 shrink-0"
              style={d.isToday ? { color: "var(--color-signal)", fontWeight: 600 } : undefined}
            >
              {formatDayShort(d.day)}
            </span>
            <span className="tabular w-32 shrink-0 text-xs">
              {d.shiftCode
                ? `${d.shiftLabel} ${d.startTime}–${d.endTime}`
                : "Repos"}
            </span>
            <span className="min-w-0 flex-1 truncate text-xs">
              {d.workout ? d.workout.title : <span className="text-[var(--color-faint)]">—</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
