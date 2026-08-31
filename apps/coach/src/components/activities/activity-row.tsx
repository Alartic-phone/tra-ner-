import Link from "next/link";
import type { CSSProperties } from "react";
import { RouteThumbnail } from "@/components/activities/route-thumbnail.tsx";
import { ZoneBar } from "@/components/activities/zone-bar.tsx";
import { Unavailable } from "@/components/ui/badge.tsx";
import { formatClock, formatDistance, formatPace, formatSpeed, paceFromSpeed } from "@/lib/utils.ts";
import { formatInstant } from "@/lib/time.ts";
import { isRun } from "@/lib/strava/mapping.ts";
import type { Day } from "@/lib/shifts/day.ts";

export type SessionMatch = "in_zone" | "out_of_zone";

export type ActivityRowData = {
  id: string;
  name: string;
  type: string;
  startedAt: Date;
  startDay: Day;
  distanceM: number;
  movingTimeS: number;
  avgSpeedMps: number | null;
  avgHr: number | null;
  hasStreams: boolean;
  shiftLabel: string;
  secondsByZone: readonly number[] | null;
  latlng: ReadonlyArray<[number, number] | null> | null;
  /** `null` = pas de séance planifiée à comparer, jamais un verdict inventé. */
  sessionMatch: SessionMatch | null;
};

/**
 * Une ligne du fil d'activités. Remplace l'ancienne grille de cartes : une
 * activité par ligne, pensée pour être parcourue vite (vignette + chiffres
 * clés + bande de zone), avec la carte complète toujours à un clic.
 */
export function ActivityRow({
  activity,
  staggerIndex,
}: {
  activity: ActivityRowData;
  staggerIndex?: number;
}) {
  const running = isRun(activity.type);

  return (
    <Link
      href={{ pathname: `/activites/${activity.id}` }}
      className="stagger-item group flex gap-3 rounded-[var(--radius-card)] border border-transparent p-2 transition-[transform,box-shadow,border-color] duration-[var(--duration-fast)] hover:-translate-y-0.5 hover:border-[var(--color-border)] hover:shadow-[var(--shadow-elevated)]"
      style={staggerIndex != null ? ({ "--stagger-index": staggerIndex } as CSSProperties) : undefined}
    >
      <RouteThumbnail
        latlng={activity.latlng}
        type={activity.type}
        size={96}
        className="opacity-80 transition-opacity duration-[var(--duration-fast)] group-hover:opacity-100"
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-medium">{activity.name}</p>
          {activity.sessionMatch ? (
            <span
              title={
                activity.sessionMatch === "in_zone"
                  ? "Séance planifiée : dans la zone prescrite"
                  : "Séance planifiée : hors de la zone prescrite"
              }
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{
                backgroundColor:
                  activity.sessionMatch === "in_zone" ? "var(--color-ok)" : "var(--color-warn)",
              }}
            />
          ) : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
          {formatInstant(activity.startedAt)} · poste : {activity.shiftLabel}
          {!activity.hasStreams ? " · sans flux" : ""}
        </p>

        <div className="tabular mt-2 grid grid-cols-4 gap-2">
          <div>
            <div className="text-sm font-semibold sm:text-base">{formatDistance(activity.distanceM)}</div>
            <div className="text-[10px] text-[var(--color-faint)]">distance</div>
          </div>
          <div>
            <div className="text-sm font-semibold sm:text-base">
              {running
                ? formatPace(paceFromSpeed(activity.avgSpeedMps))
                : formatSpeed(activity.avgSpeedMps)}
            </div>
            <div className="text-[10px] text-[var(--color-faint)]">{running ? "allure" : "vitesse"}</div>
          </div>
          <div>
            <div className="text-sm font-semibold sm:text-base">
              {activity.avgHr ?? <Unavailable reason="Aucun cardio sur cette séance" />}
            </div>
            <div className="text-[10px] text-[var(--color-faint)]">{activity.avgHr ? "bpm moy." : ""}</div>
          </div>
          <div>
            <div className="text-sm font-semibold sm:text-base">{formatClock(activity.movingTimeS)}</div>
            <div className="text-[10px] text-[var(--color-faint)]">durée</div>
          </div>
        </div>

        <ZoneBar secondsByZone={activity.secondsByZone} className="mt-2 h-1" />
      </div>
    </Link>
  );
}
