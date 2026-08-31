import { addDays } from "@/lib/shifts/day.ts";
import type { Day } from "@/lib/shifts/day.ts";

/** "2026-08-24" -> "24 – 30 août" (ou "29 déc. – 4 janv." si la semaine
 * chevauche deux mois). */
function formatWeekRange(monday: Day): string {
  const sunday = addDays(monday, 6);
  const start = new Date(`${monday}T00:00:00.000Z`);
  const end = new Date(`${sunday}T00:00:00.000Z`);
  const dayFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", day: "numeric" });
  const monthFmt = new Intl.DateTimeFormat("fr-FR", { timeZone: "UTC", month: "short" });

  const endLabel = `${dayFmt.format(end)} ${monthFmt.format(end)}`;
  if (start.getUTCMonth() === end.getUTCMonth()) {
    return `${dayFmt.format(start)} – ${endLabel}`;
  }
  return `${dayFmt.format(start)} ${monthFmt.format(start)} – ${endLabel}`;
}

/** "0" pour une semaine sans activité de ce sport, jamais un flottant creux. */
function formatWeekKm(meters: number): string {
  if (meters <= 0) return "0 km";
  return `${(meters / 1000).toFixed(2).replace(".", ",")} km`;
}

export type WeekSummary = {
  monday: Day;
  count: number;
  runDistanceM: number;
  rideDistanceM: number;
  totalDistanceM: number;
};

/**
 * En-tête de semaine du fil d'activités : la charge de la semaine d'un coup
 * d'œil, sans avoir à additionner les lignes en dessous. `maxWeekVolumeM` fixe
 * l'échelle commune de la mini-barre — relative aux semaines réellement
 * chargées, jamais un plafond arbitraire.
 */
export function WeekHeader({ week, maxWeekVolumeM }: { week: WeekSummary; maxWeekVolumeM: number }) {
  const barPct = maxWeekVolumeM > 0 ? Math.max(4, (week.totalDistanceM / maxWeekVolumeM) * 100) : 0;

  return (
    <div className="sticky top-0 z-10 -mx-4 flex items-center justify-between gap-3 bg-[var(--color-bg)]/95 px-4 py-2 backdrop-blur-sm">
      <p className="text-xs font-medium text-[var(--color-muted)]">
        {formatWeekRange(week.monday)}
        <span className="text-[var(--color-faint)]">
          {" · "}
          {formatWeekKm(week.runDistanceM)} course · {formatWeekKm(week.rideDistanceM)} vélo ·{" "}
          {week.count} sortie{week.count > 1 ? "s" : ""}
        </span>
      </p>
      <div className="h-1 w-16 shrink-0 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-surface-2)]">
        <div
          className="h-full rounded-[var(--radius-pill)] bg-[var(--color-accent)]"
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  );
}
