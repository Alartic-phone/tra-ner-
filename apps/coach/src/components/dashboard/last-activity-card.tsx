import Link from "next/link";
import { Card, CardHeader } from "@/components/ui/card.tsx";
import { Unavailable } from "@/components/ui/badge.tsx";
import { TraceThumbnail } from "@/components/activities/trace-thumbnail.tsx";
import { ActivityTypeIcon, sportColor } from "@/components/activities/activity-icon.tsx";
import { isRun } from "@/lib/strava/mapping.ts";
import { formatDistance, formatPace, formatSpeed, paceFromSpeed } from "@/lib/utils.ts";

type LastActivity = {
  id: string;
  name: string;
  type: string;
  distanceM: number;
  avgSpeedMps: number | null;
  avgHr: number | null;
  tracePath: string | null;
  traceViewBox: string | null;
};

export function LastActivityCard({ activity }: { activity: LastActivity | null }) {
  if (!activity) {
    return (
      <Card>
        <CardHeader title="Dernière activité" />
        <div className="px-4 py-6 text-xs text-[var(--color-muted)]">
          <Unavailable reason="Aucune activité enregistrée" />
        </div>
      </Card>
    );
  }

  const running = isRun(activity.type);

  return (
    <Link href={{ pathname: `/activites/${activity.id}` }}>
      <Card interactive>
        <CardHeader title="Dernière activité" />
        <div className="flex items-center gap-3 px-4 py-3">
          <span
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[var(--radius-card)] bg-[var(--color-surface-2)]"
            style={{ color: sportColor(activity.type) }}
          >
            {activity.tracePath && activity.traceViewBox ? (
              <TraceThumbnail
                tracePath={activity.tracePath}
                traceViewBox={activity.traceViewBox}
                strokeWidth={2.5}
                className="h-14 w-14 p-1.5"
              />
            ) : (
              <ActivityTypeIcon type={activity.type} size={20} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{activity.name}</p>
            <div className="tabular mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-muted)]">
              <span>{formatDistance(activity.distanceM)}</span>
              <span>
                {running ? formatPace(paceFromSpeed(activity.avgSpeedMps)) : formatSpeed(activity.avgSpeedMps)}
              </span>
              <span>{activity.avgHr != null ? `${activity.avgHr} bpm` : <Unavailable />}</span>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
