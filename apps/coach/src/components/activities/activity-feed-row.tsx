import Link from "next/link";
import { Trophy } from "lucide-react";
import { ActivityTypeIcon, sportColor } from "@/components/activities/activity-icon.tsx";
import { TraceThumbnail } from "@/components/activities/trace-thumbnail.tsx";
import { ZoneBar } from "@/components/activities/zone-bar.tsx";
import { formatClock, formatDistance, formatPace, formatSpeed, paceFromSpeed } from "@/lib/utils.ts";
import { formatDayShort, toLocalTime } from "@/lib/time.ts";
import { isRun } from "@/lib/strava/mapping.ts";

type FeedActivity = {
  id: string;
  name: string;
  type: string;
  startedAt: Date;
  startDay: string;
  distanceM: number;
  movingTimeS: number;
  avgSpeedMps: number | null;
  avgHr: number | null;
  tracePath: string | null;
  traceViewBox: string | null;
};

/**
 * Une ligne du fil d'activités : vignette de tracé 96 px à gauche (lue
 * depuis le cache, jamais une décompression de flux par ligne), mini-barre
 * de zones sous la ligne.
 */
export function ActivityFeedRow({
  activity,
  secondsByZone,
  isPersonalRecord,
  staggerIndex,
}: {
  activity: FeedActivity;
  secondsByZone: readonly number[] | null;
  isPersonalRecord: boolean;
  staggerIndex: number;
}) {
  const running = isRun(activity.type);
  const color = sportColor(activity.type);

  return (
    <Link
      href={{ pathname: `/activites/${activity.id}` }}
      className="stagger-item flex gap-3 border-b border-[var(--color-border)] px-3 py-3 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-2)] last:border-0"
      style={{ "--stagger-index": staggerIndex } as React.CSSProperties}
    >
      <span
        className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[var(--radius-card)] bg-[var(--color-surface-2)]"
        style={{ color }}
      >
        {activity.tracePath && activity.traceViewBox ? (
          <TraceThumbnail
            tracePath={activity.tracePath}
            traceViewBox={activity.traceViewBox}
            className="h-24 w-24 p-2"
          />
        ) : (
          <ActivityTypeIcon type={activity.type} size={28} />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{activity.name}</p>
            <p className="mt-0.5 text-xs text-[var(--color-muted)]">
              {formatDayShort(activity.startDay)} · {toLocalTime(activity.startedAt)} · {activity.type}
            </p>
          </div>
          {isPersonalRecord ? (
            <Trophy size={14} className="mt-0.5 shrink-0 text-[var(--color-signal)]" aria-hidden />
          ) : null}
        </div>

        <div className="tabular mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-[var(--color-muted)]">
          <span>{formatDistance(activity.distanceM)}</span>
          <span>{formatClock(activity.movingTimeS)}</span>
          <span>
            {running ? formatPace(paceFromSpeed(activity.avgSpeedMps)) : formatSpeed(activity.avgSpeedMps)}
          </span>
          <span>{activity.avgHr != null ? `${activity.avgHr} bpm` : null}</span>
        </div>

        <ZoneBar secondsByZone={secondsByZone} className="mt-2" />
      </div>
    </Link>
  );
}
