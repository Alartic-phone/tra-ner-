import Link from "next/link";
import type { CSSProperties } from "react";
import { Trophy } from "lucide-react";
import { ActivityTypeIcon, sportColor } from "@/components/activities/activity-icon.tsx";
import { ZoneBar } from "@/components/activities/zone-bar.tsx";
import { Unavailable } from "@/components/ui/badge.tsx";
import { Card } from "@/components/ui/card.tsx";
import { formatClock, formatDistance, formatPace, formatSpeed, paceFromSpeed } from "@/lib/utils.ts";
import { formatInstant } from "@/lib/time.ts";
import { isRun } from "@/lib/strava/mapping.ts";

export type ActivityCardData = {
  id: string;
  name: string;
  type: string;
  startedAt: Date;
  distanceM: number;
  movingTimeS: number;
  avgSpeedMps: number | null;
  avgHr: number | null;
  hasStreams: boolean;
};

/**
 * Carte d'activité — remplace la ligne de tableau. La barre de zone en pied
 * de carte est l'information la plus utile : elle donne d'un coup d'œil la
 * difficulté de la séance, sans avoir à lire un seul chiffre.
 */
export function ActivityCard({
  activity,
  secondsByZone,
  isPersonalRecord,
  staggerIndex,
}: {
  activity: ActivityCardData;
  secondsByZone: readonly number[] | null;
  isPersonalRecord: boolean;
  staggerIndex?: number;
}) {
  const color = sportColor(activity.type);
  const running = isRun(activity.type);

  return (
    <Link
      href={{ pathname: `/activites/${activity.id}` }}
      className="stagger-item block"
      style={staggerIndex != null ? ({ "--stagger-index": staggerIndex } as CSSProperties) : undefined}
    >
      <Card
        interactive
        className="relative overflow-hidden p-4 hover:shadow-[var(--shadow-elevated)]"
      >
        {isPersonalRecord ? (
          <span
            title="Record personnel battu ou égalé sur cette séance"
            className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 px-2 py-0.5 text-[10px] font-medium text-[var(--color-warn)]"
          >
            <Trophy size={11} aria-hidden /> record
          </span>
        ) : null}

        <div className="flex items-center gap-3">
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
            style={{ backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)`, color }}
          >
            <ActivityTypeIcon type={activity.type} size={18} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{activity.name}</p>
            <p className="text-xs text-[var(--color-muted)]">
              {formatInstant(activity.startedAt)}
              {!activity.hasStreams ? " · sans flux" : ""}
            </p>
          </div>
        </div>

        <div className="tabular mt-3 grid grid-cols-3 gap-2">
          <div>
            <div className="text-lg font-semibold sm:text-xl">{formatDistance(activity.distanceM)}</div>
            <div className="text-[11px] text-[var(--color-faint)]">distance</div>
          </div>
          <div>
            <div className="text-lg font-semibold sm:text-xl">
              {running
                ? formatPace(paceFromSpeed(activity.avgSpeedMps))
                : formatSpeed(activity.avgSpeedMps)}
            </div>
            <div className="text-[11px] text-[var(--color-faint)]">{running ? "allure" : "vitesse"}</div>
          </div>
          <div>
            <div className="text-lg font-semibold sm:text-xl">
              {activity.avgHr ?? <Unavailable reason="Aucun cardio sur cette séance" />}
            </div>
            <div className="text-[11px] text-[var(--color-faint)]">
              {activity.avgHr ? "bpm moy." : ""}
            </div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--color-faint)]">
          <span>{formatClock(activity.movingTimeS)}</span>
        </div>
        <ZoneBar secondsByZone={secondsByZone} className="mt-2" />
      </Card>
    </Link>
  );
}
