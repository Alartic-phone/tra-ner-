import Link from "next/link";
import { Card } from "@/components/ui/card.tsx";
import { HeroStat } from "@/components/ui/hero-stat.tsx";
import { Sparkline } from "@/components/ui/sparkline.tsx";
import { ZONE_RAMP } from "@/lib/metrics/zones.ts";
import { weekdayLabel, type Day } from "@/lib/shifts/day.ts";
import { cn } from "@/lib/utils.ts";

export type WeekDayBar = {
  day: Day;
  code: string | null;
  shiftColor: string | null;
  /** Kilomètres de course ce jour-là — 0 si aucune sortie, jamais `null`. */
  distanceKm: number;
  /** Zone FC dominante (1-5) pondérée par le temps de sortie, `null` sans mesure cardio. */
  dominantZone: number | null;
};

/**
 * La semaine en un coup d'œil : une barre par jour, sa hauteur = les km de
 * course, sa couleur = la zone FC dominante (même rampe que `ZoneChart`).
 * Le code de poste sous chaque colonne resitue l'effort dans les contraintes
 * de la semaine sans avoir à ouvrir le calendrier.
 */
export function WeekStrip({
  days,
  totalKm,
  targetKm,
  weeklySparkline,
  today,
  cascadeIndex,
}: {
  days: readonly WeekDayBar[];
  totalKm: number;
  targetKm: number | null;
  weeklySparkline: (number | null)[];
  today: Day;
  cascadeIndex: number;
}) {
  const maxKm = Math.max(1, ...days.map((d) => d.distanceKm));

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-medium">Cette semaine</h2>
        <Link href="/calendrier" className="text-xs text-[var(--color-accent)] hover:underline">
          Calendrier →
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1.5 sm:gap-2">
        {days.map((d) => {
          const isToday = d.day === today;
          return (
            <div key={d.day} className="flex flex-col items-center gap-1">
              <span className="text-[10px] text-[var(--color-faint)]">
                {weekdayLabel(d.day).charAt(0).toUpperCase()}
              </span>
              <div
                className={cn(
                  "flex h-20 w-full items-end overflow-hidden rounded-[4px] bg-[var(--color-surface-2)]",
                  isToday && "ring-1 ring-[var(--color-accent)]",
                )}
              >
                {d.distanceKm > 0 ? (
                  <div
                    className="w-full rounded-t-[3px] transition-[height] duration-[var(--duration-slow)] ease-[var(--ease-standard)]"
                    style={{
                      height: `${Math.max(6, (d.distanceKm / maxKm) * 100)}%`,
                      backgroundColor: d.dominantZone ? ZONE_RAMP[d.dominantZone - 1] : "var(--chart-neutral)",
                    }}
                    title={`${d.distanceKm.toFixed(1)} km`}
                  />
                ) : null}
              </div>
              <span
                className="tabular text-[10px] font-semibold"
                style={{ color: d.code ? (d.shiftColor ?? "var(--color-muted)") : "var(--color-faint)" }}
              >
                {d.code ?? "—"}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mt-4 flex items-end justify-between gap-4 border-t border-[var(--color-border)] pt-3">
        <div className="hero-cascade" style={{ "--stagger-index": cascadeIndex } as React.CSSProperties}>
          <HeroStat
            label="Volume semaine"
            value={totalKm.toFixed(1)}
            unit="km"
            size="md"
            tone={targetKm != null && totalKm < targetKm * 0.7 ? "warn" : "default"}
          />
          {targetKm != null ? (
            <p className="mt-1 text-[11px] text-[var(--color-faint)]">Cible : {targetKm.toFixed(0)} km</p>
          ) : null}
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] text-[var(--color-faint)]">8 dernières semaines</span>
          <Sparkline values={weeklySparkline} />
        </div>
      </div>
    </Card>
  );
}
