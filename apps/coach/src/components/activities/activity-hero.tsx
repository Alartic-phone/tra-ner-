"use client";

import { ActivityTypeIcon, sportColor, sportLabel } from "@/components/activities/activity-icon.tsx";
import { RouteMap, type MapSelection } from "@/components/activities/route-map.tsx";
import type { GeoPoint } from "@/lib/streams.ts";

/**
 * Héro pleine largeur : le tracé en fond, nom/date/poste/sport en
 * surimpression sur un dégradé vers `--color-bg`. 45vh en desktop, 30vh en
 * mobile — assez grand pour être le point d'ancrage visuel de la page, sans
 * repousser les chiffres sous la ligne de flottaison.
 */
export function ActivityHero({
  points,
  mapTilerKey,
  name,
  dateLabel,
  shiftLabel,
  sportType,
  cursorT,
  selection,
}: {
  points: GeoPoint[];
  mapTilerKey?: string;
  name: string;
  dateLabel: string;
  shiftLabel: string;
  sportType: string;
  cursorT?: number | null;
  selection?: MapSelection | null;
}) {
  const color = sportColor(sportType);

  return (
    <div className="relative -mx-4 h-[30vh] min-h-[220px] overflow-hidden bg-[var(--color-surface)] md:-mx-6 md:h-[45vh]">
      {points.length >= 2 ? (
        <RouteMap
          points={points}
          mapTilerKey={mapTilerKey}
          strokeWidth={4}
          className="h-full w-full"
          cursorT={cursorT}
          selection={selection}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-xs text-[var(--color-faint)]">
          Aucune donnée de position pour cette activité.
        </div>
      )}

      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4 md:p-6"
        style={{
          backgroundImage:
            "linear-gradient(to top, var(--color-bg) 0%, color-mix(in oklab, var(--color-bg) 70%, transparent) 55%, transparent 100%)",
        }}
      >
        <div className="min-w-0">
          <h1 className="truncate text-lg font-semibold md:text-2xl">{name}</h1>
          <p className="mt-0.5 text-xs text-[var(--color-muted)] md:text-sm">
            {dateLabel} · poste du jour : {shiftLabel}
          </p>
        </div>
        <span
          className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-pill)] border px-2 py-0.5 text-[11px] font-medium leading-4"
          style={{ borderColor: `color-mix(in oklab, ${color} 45%, transparent)`, color }}
        >
          <ActivityTypeIcon type={sportType} size={12} />
          {sportLabel(sportType)}
        </span>
      </div>
    </div>
  );
}
