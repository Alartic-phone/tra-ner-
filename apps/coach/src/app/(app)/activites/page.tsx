import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { Card, CardHeader } from "@/components/ui/card.tsx";
import { ActivityFiltersBar } from "@/components/activities/activity-filters-bar.tsx";
import { ActivityRow, type ActivityRowData, type SessionMatch } from "@/components/activities/activity-row.tsx";
import { WeekHeader, type WeekSummary } from "@/components/activities/week-header.tsx";
import { sportCategory, sportColor } from "@/components/activities/activity-icon.tsx";
import { getProfileStatus, loadZoneSecondsByActivity } from "@/lib/metrics/repository.ts";
import { computeHeartRateZones, zoneForHeartRate, type HeartRateZone } from "@/lib/metrics/zones.ts";
import { loadRoutePreviews } from "@/lib/streams.ts";
import { loadShiftRange } from "@/lib/shifts/repository.ts";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { mondayOf, minDay, maxDay, type Day } from "@/lib/shifts/day.ts";
import { isRun } from "@/lib/strava/mapping.ts";
import { paceFromSpeed } from "@/lib/utils.ts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

type SortKey = "date" | "distance" | "hr";

function parseSort(value: string | undefined): SortKey {
  return value === "distance" || value === "hr" ? value : "date";
}

/**
 * Un point vert/orange n'apparaît que si la séance est rapprochée d'une
 * séance planifiée ET que l'écart est mesurable (allure sur une course, ou
 * zone FC avec un profil renseigné). Sinon : pas de point du tout, jamais un
 * verdict inventé faute de donnée pour le calculer.
 */
function matchPlannedSession(
  activity: { type: string; avgSpeedMps: number | null; avgHr: number | null },
  planned: {
    targetPaceMinSPerKm: number | null;
    targetPaceMaxSPerKm: number | null;
    targetHrZone: number | null;
  },
  hrZones: readonly HeartRateZone[] | null,
): SessionMatch | null {
  if (
    isRun(activity.type) &&
    planned.targetPaceMinSPerKm != null &&
    planned.targetPaceMaxSPerKm != null
  ) {
    const pace = paceFromSpeed(activity.avgSpeedMps);
    if (pace != null) {
      return pace >= planned.targetPaceMinSPerKm && pace <= planned.targetPaceMaxSPerKm
        ? "in_zone"
        : "out_of_zone";
    }
  }
  if (planned.targetHrZone != null && activity.avgHr != null && hrZones && hrZones.length > 0) {
    const zone = zoneForHeartRate(activity.avgHr, hrZones);
    if (zone) return zone.index === planned.targetHrZone ? "in_zone" : "out_of_zone";
  }
  return null;
}

type WeekGroup = { summary: WeekSummary; rows: ActivityRowData[] };

/** Regroupement par semaine ISO (lundi -> dimanche), dans l'ordre où les
 * lignes arrivent — n'a de sens qu'à l'ordre chronologique, cf. appelant. */
function groupByWeek(rows: readonly ActivityRowData[]): WeekGroup[] {
  const groups: WeekGroup[] = [];
  const index = new Map<Day, WeekGroup>();

  for (const row of rows) {
    const monday = mondayOf(row.startDay);
    let group = index.get(monday);
    if (!group) {
      group = {
        summary: { monday, count: 0, runDistanceM: 0, rideDistanceM: 0, totalDistanceM: 0 },
        rows: [],
      };
      index.set(monday, group);
      groups.push(group);
    }
    group.rows.push(row);
    group.summary.count += 1;
    group.summary.totalDistanceM += row.distanceM;
    const category = sportCategory(row.type);
    if (category === "run") group.summary.runDistanceM += row.distanceM;
    if (category === "ride") group.summary.rideDistanceM += row.distanceM;
  }

  return groups;
}

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; q?: string; sort?: string; limit?: string }>;
}) {
  const params = await searchParams;
  const type = params.type || undefined;
  const q = (params.q ?? "").trim();
  const sort = parseSort(params.sort);
  const limit = Math.min(500, Math.max(PAGE_SIZE, Number(params.limit) || PAGE_SIZE));

  const where = {
    ...(type ? { type } : {}),
    ...(q ? { name: { contains: q } } : {}),
  };

  const orderBy =
    sort === "distance"
      ? [{ distanceM: "desc" as const }]
      : sort === "hr"
        ? [{ avgHr: { sort: "desc" as const, nulls: "last" as const } }]
        : [{ startedAt: "desc" as const }];

  const [activities, total, types] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy,
      take: limit,
      include: { plannedWorkout: true },
    }),
    prisma.activity.count({ where }),
    prisma.activity.groupBy({ by: ["type"], _count: { type: true } }),
  ]);

  const activityIds = activities.map((a) => a.id);
  const rules = await getAvailabilityRules();
  const [zonesByActivity, routePreviews, profileStatus, shifts] = await Promise.all([
    loadZoneSecondsByActivity(activityIds),
    loadRoutePreviews(activityIds),
    getProfileStatus(),
    activities.length > 0
      ? loadShiftRange(
          activities.map((a) => a.startDay).reduce(minDay),
          activities.map((a) => a.startDay).reduce(maxDay),
          rules,
        )
      : null,
  ]);

  const hrZones = profileStatus.profile
    ? computeHeartRateZones(profileStatus.profile.hrMax, profileStatus.profile.hrRest)
    : null;

  const rows: ActivityRowData[] = activities.map((a) => {
    const shiftInfo = shifts?.byDay.get(a.startDay);
    const code = shiftInfo?.resolved.code;
    const shiftLabel = code ? (shifts?.timings.find((t) => t.code === code)?.label ?? code) : "repos";

    return {
      id: a.id,
      name: a.name,
      type: a.type,
      startedAt: a.startedAt,
      startDay: a.startDay,
      distanceM: a.distanceM,
      movingTimeS: a.movingTimeS,
      avgSpeedMps: a.avgSpeedMps,
      avgHr: a.avgHr,
      hasStreams: a.hasStreams,
      shiftLabel,
      secondsByZone: zonesByActivity.get(a.id) ?? null,
      latlng: routePreviews.get(a.id) ?? null,
      sessionMatch: a.plannedWorkout ? matchPlannedSession(a, a.plannedWorkout, hrZones) : null,
    };
  });

  // Un tri par distance ou par FC éparpille les jours : un en-tête de
  // semaine y serait trompeur, les activités d'une même semaine n'étant plus
  // contiguës. La vue groupée ne s'active qu'à l'ordre chronologique.
  const weeks = sort === "date" ? groupByWeek(rows) : null;
  const maxWeekVolumeM = weeks ? Math.max(0, ...weeks.map((w) => w.summary.totalDistanceM)) : 0;

  const hasMore = activities.length < total;
  const nextLimit = limit + PAGE_SIZE;

  function buildQuery(overrides: Record<string, string | number | undefined>) {
    const query: Record<string, string | number> = {};
    if (type) query.type = type;
    if (q) query.q = q;
    if (sort !== "date") query.sort = sort;
    for (const [key, value] of Object.entries(overrides)) {
      if (value == null) delete query[key];
      else query[key] = value;
    }
    return query;
  }

  return (
    <div className="p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold">Activités</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          {total} activité{total > 1 ? "s" : ""} importée{total > 1 ? "s" : ""}.
        </p>
      </header>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Link
          href={{ pathname: "/activites", query: buildQuery({ type: undefined }) }}
          className={`rounded-[var(--radius-pill)] border px-3 py-1 text-xs transition-colors duration-[var(--duration-fast)] ${
            type
              ? "border-[var(--color-border-strong)] text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
              : "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
          }`}
        >
          Tout
        </Link>
        {types.map((t) => {
          const color = sportColor(t.type);
          const active = type === t.type;
          return (
            <Link
              key={t.type}
              href={{ pathname: "/activites", query: buildQuery({ type: t.type }) }}
              className="rounded-[var(--radius-pill)] border px-3 py-1 text-xs transition-colors duration-[var(--duration-fast)]"
              style={
                active
                  ? {
                      borderColor: color,
                      backgroundColor: `color-mix(in oklab, ${color} 16%, transparent)`,
                      color,
                    }
                  : { borderColor: "var(--color-border-strong)", color: "var(--color-muted)" }
              }
            >
              {t.type} ({t._count.type})
            </Link>
          );
        })}
      </div>

      <ActivityFiltersBar initialQuery={q} />

      {activities.length === 0 ? (
        <Card className="mt-4">
          <CardHeader
            title="Aucune activité"
            hint={
              type || q
                ? "Aucune activité ne correspond à ces filtres."
                : "Connecter Strava depuis les réglages pour lancer l'import de l'historique."
            }
          />
        </Card>
      ) : weeks ? (
        <div className="mt-4 flex flex-col gap-1">
          {weeks.map((week) => (
            <div key={week.summary.monday}>
              <WeekHeader week={week.summary} maxWeekVolumeM={maxWeekVolumeM} />
              <div className="flex flex-col gap-1 pt-1">
                {week.rows.map((row, i) => (
                  <ActivityRow key={row.id} activity={row} staggerIndex={i} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-1">
          {rows.map((row, i) => (
            <ActivityRow key={row.id} activity={row} staggerIndex={i} />
          ))}
        </div>
      )}

      {hasMore ? (
        <div className="mt-4 flex justify-center">
          <Link
            href={{ pathname: "/activites", query: buildQuery({ limit: nextLimit }) }}
            scroll={false}
            className="rounded-[var(--radius-pill)] border border-[var(--color-border-strong)] px-4 py-1.5 text-xs text-[var(--color-muted)] transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-2)]"
          >
            Charger plus ({activities.length} / {total})
          </Link>
        </div>
      ) : null}
    </div>
  );
}
