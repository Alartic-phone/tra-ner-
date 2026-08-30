"use client";

import { Unavailable } from "@/components/ui/badge.tsx";
import { cn, formatDistance, formatPace, formatSpeed, paceFromSpeed } from "@/lib/utils.ts";
import type { MapSelection } from "@/components/activities/route-map.tsx";

export type LapRow = {
  id: string;
  label: string;
  distanceM: number;
  avgSpeedMps: number | null;
  avgHr: number | null;
  elevationGainM: number | null;
  startT: number;
  endT: number;
};

/**
 * Table partagée par les splits kilométriques et les tours manuels — mêmes
 * colonnes des deux côtés. Un clic sélectionne la portion correspondante sur
 * la carte et les 4 graphiques ; un second clic sur la même ligne annule la
 * sélection.
 */
export function LapRowsTable({
  rows,
  isRunActivity,
  sportColor,
  selection,
  onSelect,
}: {
  rows: LapRow[];
  isRunActivity: boolean;
  sportColor: string;
  selection: MapSelection | null;
  onSelect: (selection: MapSelection | null) => void;
}) {
  if (rows.length === 0) return null;

  const speeds = rows.map((r) => r.avgSpeedMps ?? 0);
  const maxSpeed = Math.max(...speeds, 0);
  const fastestIndex = maxSpeed > 0 ? speeds.indexOf(maxSpeed) : -1;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
            <th className="px-3 py-2 font-medium">#</th>
            <th className="px-3 py-2 text-right font-medium">Distance</th>
            <th className="px-3 py-2 font-medium">{isRunActivity ? "Allure" : "Vitesse"}</th>
            <th className="px-3 py-2 text-right font-medium">FC moy.</th>
            <th className="px-3 py-2 text-right font-medium">D+</th>
            <th className="px-3 py-2 text-right font-medium">D-</th>
          </tr>
        </thead>
        <tbody className="tabular">
          {rows.map((row, i) => {
            const pace = paceFromSpeed(row.avgSpeedMps);
            const barPct = maxSpeed > 0 ? Math.max(4, ((row.avgSpeedMps ?? 0) / maxSpeed) * 100) : 0;
            const selected = selection?.startT === row.startT && selection?.endT === row.endT;
            const toggle = () => onSelect(selected ? null : { startT: row.startT, endT: row.endT });
            return (
              <tr
                key={row.id}
                onClick={toggle}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    toggle();
                  }
                }}
                tabIndex={0}
                role="button"
                aria-pressed={selected}
                className={cn(
                  "cursor-pointer border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)] focus-visible:outline-none",
                  selected && "bg-[var(--color-surface-2)]",
                )}
              >
                <td className="px-3 py-1.5">{row.label}</td>
                <td className="px-3 py-1.5 text-right">{formatDistance(row.distanceM)}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-[var(--radius-pill)] bg-[var(--color-surface-2)]">
                      <span
                        className="block h-full rounded-[var(--radius-pill)]"
                        style={{
                          width: `${barPct}%`,
                          backgroundColor: i === fastestIndex ? sportColor : "var(--color-faint)",
                        }}
                      />
                    </span>
                    <span>{isRunActivity ? formatPace(pace) : formatSpeed(row.avgSpeedMps)}</span>
                  </div>
                </td>
                <td className="px-3 py-1.5 text-right">{row.avgHr ?? <Unavailable />}</td>
                <td className="px-3 py-1.5 text-right">
                  {row.elevationGainM != null ? `+${Math.round(row.elevationGainM)} m` : <Unavailable />}
                </td>
                <td className="px-3 py-1.5 text-right">
                  <Unavailable reason="Dénivelé négatif non fourni par tour par l'API Strava" />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
