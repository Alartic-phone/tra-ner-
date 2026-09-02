import { weekdayLabel, type Day } from "@/lib/shifts/day.ts";

export type WeekBarDay = { day: Day; km: number; isToday: boolean };

/**
 * Sept barres, une par jour — le volume de la semaine d'un coup d'œil. Pas
 * d'animation de montée ici : c'est la carte des tracés annuelle qui a le
 * droit à l'entrée remarquée de son écran (une seule par page).
 */
export function WeekBars({ days }: { days: WeekBarDay[] }) {
  const max = Math.max(1, ...days.map((d) => d.km));

  return (
    <div className="flex h-20 items-end gap-2">
      {days.map((d) => (
        <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
          <div className="flex h-14 w-full items-end">
            <div
              className="w-full rounded-t-[3px] transition-[height] duration-[var(--duration-base)]"
              style={{
                height: d.km > 0 ? `${Math.max(6, (d.km / max) * 100)}%` : "2px",
                backgroundColor: d.isToday ? "var(--color-accent)" : "var(--color-border-strong)",
              }}
              title={`${d.km.toFixed(1)} km`}
            />
          </div>
          <span
            className="text-[10px] capitalize"
            style={{ color: d.isToday ? "var(--color-text)" : "var(--color-faint)" }}
          >
            {weekdayLabel(d.day).slice(0, 3)}
          </span>
        </div>
      ))}
    </div>
  );
}
