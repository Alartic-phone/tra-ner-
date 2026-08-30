import Link from "next/link";
import { Card } from "@/components/ui/card.tsx";
import { HeroStat } from "@/components/ui/hero-stat.tsx";
import { Unavailable } from "@/components/ui/badge.tsx";
import { ActivityTypeIcon, sportColor, sportKey } from "@/components/activities/activity-icon.tsx";
import { RouteMap } from "@/components/activities/route-map.tsx";
import { RecordCelebration } from "@/components/activities/record-celebration.tsx";
import { isRun } from "@/lib/strava/mapping.ts";
import { formatDistance, formatPace, formatSpeed, paceFromSpeed } from "@/lib/utils.ts";
import { formatInstant } from "@/lib/time.ts";

type LastActivity = {
  id: string;
  name: string;
  type: string;
  startedAt: Date;
  distanceM: number;
  avgSpeedMps: number | null;
  avgHr: number | null;
};

/**
 * Carte hero de la dernière activité : la carte MapLibre du tracé sert de
 * fond (sombre, sans contrôles), les chiffres sont posés par-dessus. Une
 * activité sans flux GPS (salle, import ancien) retombe sur un fond uni —
 * jamais un rectangle de carte cassé ou vide.
 */
export function LastActivityCard({
  activity,
  latlng,
  personalRecords,
  mapTilerKey,
  cascadeStart,
}: {
  activity: LastActivity | null;
  latlng: ReadonlyArray<[number, number] | null> | null;
  personalRecords: number[];
  mapTilerKey: string | undefined;
  cascadeStart: number;
}) {
  if (!activity) {
    return (
      <Card className="p-4">
        <p className="text-xs text-[var(--color-muted)]">
          Aucune activité.{" "}
          <Link href="/reglages" className="text-[var(--color-accent)] hover:underline">
            Connecter Strava
          </Link>{" "}
          depuis les réglages.
        </p>
      </Card>
    );
  }

  const isRunActivity = isRun(activity.type);
  const color = sportColor(activity.type);

  return (
    <Link href={{ pathname: `/activites/${activity.id}` }} className="block">
      <Card interactive className="overflow-hidden p-0">
        <div className="relative h-60 overflow-hidden">
          {latlng ? (
            <RouteMap
              latlng={latlng}
              mapTilerKey={mapTilerKey}
              width={600}
              height={600}
              strokeWidth={5}
              showMarkers={false}
              color={color}
              fill
              className="h-full w-full"
            />
          ) : (
            <div className="absolute inset-0 bg-[var(--color-surface-2)]" />
          )}
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(to top, var(--color-surface) 5%, color-mix(in oklab, var(--color-surface) 65%, transparent) 45%, transparent 75%)",
            }}
          />

          <div className="absolute inset-x-0 bottom-0 p-4">
            <div className="flex min-w-0 items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <ActivityTypeIcon type={activity.type} className="shrink-0" />
              <span className="truncate">{activity.name}</span>
              <span className="shrink-0 text-[var(--color-faint)]">
                · {formatInstant(activity.startedAt)}
              </span>
            </div>

            {personalRecords.length > 0 ? <RecordCelebration durations={personalRecords} /> : null}

            <div className="mt-2 flex flex-wrap gap-3">
              <div className="hero-cascade" style={{ "--stagger-index": cascadeStart } as React.CSSProperties}>
                <HeroStat label="Distance" value={formatDistance(activity.distanceM)} size="md" sport={sportKey(activity.type)} />
              </div>
              <div
                className="hero-cascade"
                style={{ "--stagger-index": cascadeStart + 1 } as React.CSSProperties}
              >
                <HeroStat
                  label={isRunActivity ? "Allure" : "Vitesse"}
                  value={isRunActivity ? formatPace(paceFromSpeed(activity.avgSpeedMps)) : formatSpeed(activity.avgSpeedMps)}
                  size="md"
                  sport={sportKey(activity.type)}
                />
              </div>
              <div
                className="hero-cascade"
                style={{ "--stagger-index": cascadeStart + 2 } as React.CSSProperties}
              >
                <HeroStat
                  label="FC moyenne"
                  value={activity.avgHr ?? <Unavailable />}
                  unit={activity.avgHr ? "bpm" : undefined}
                  size="md"
                  sport={sportKey(activity.type)}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>
    </Link>
  );
}
