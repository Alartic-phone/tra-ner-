import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { Card } from "@/components/ui/card.tsx";
import { TraceThumb } from "@/components/ui/trace-thumb.tsx";
import { ZoneBar } from "@/components/activities/zone-bar.tsx";
import { sportColor } from "@/components/activities/activity-icon.tsx";
import { groupByWeek, planMatchStatus } from "@/lib/activities-feed.ts";
import {
  getProfileStatus,
  getTracePathsByActivity,
  loadZoneSecondsByActivity,
} from "@/lib/metrics/repository.ts";
import { computeHeartRateZones } from "@/lib/metrics/zones.ts";
import { isRun } from "@/lib/strava/mapping.ts";
import { formatClock, formatDistance, formatPace, paceFromSpeed } from "@/lib/utils.ts";
import { formatDayShort, formatInstant, toLocalHour } from "@/lib/time.ts";
import { normalizeActivityName } from "@/lib/activity-names.ts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ limit?: string; type?: string; q?: string; sort?: string }>;
}) {
  const { limit: limitParam, type, q, sort } = await searchParams;
  const limit = Math.max(PAGE_SIZE, Number(limitParam ?? PAGE_SIZE) || PAGE_SIZE);

  const where = {
    ...(type ? { type } : {}),
    ...(q ? { name: { contains: q } } : {}),
  };
  const orderBy =
    sort === "distance"
      ? { distanceM: "desc" as const }
      : sort === "hr"
        ? { avgHr: "desc" as const }
        : { startedAt: "desc" as const };

  const [activities, total, types, profileStatus] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy,
      take: limit + 1, // +1 pour savoir s'il reste des activités au-delà de `limit`.
      include: { plannedWorkout: { select: { targetHrZone: true } } },
    }),
    prisma.activity.count({ where }),
    prisma.activity.groupBy({ by: ["type"], _count: { type: true } }),
    getProfileStatus(),
  ]);

  const hasMore = activities.length > limit;
  const page = activities.slice(0, limit);

  const activityIds = page.map((a) => a.id);
  const [zonesByActivity, tracePathByActivity] = await Promise.all([
    loadZoneSecondsByActivity(activityIds),
    getTracePathsByActivity(activityIds),
  ]);
  const hrZones = profileStatus.profile
    ? computeHeartRateZones(profileStatus.profile.hrMax, profileStatus.profile.hrRest)
    : undefined;

  const weeks = groupByWeek(page);

  return (
    <div className="mx-auto max-w-[1100px] p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold">Activités</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          {total} activité{total > 1 ? "s" : ""} importée{total > 1 ? "s" : ""}.
        </p>
      </header>

      <form className="mt-3 flex flex-wrap items-center gap-2" action="/activites">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Rechercher par nom…"
          className="h-9 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-xs text-[var(--color-text)] placeholder:text-[var(--color-faint)] focus-visible:outline-2 focus-visible:outline-[var(--color-accent)]"
        />
        <select
          name="sort"
          defaultValue={sort ?? "date"}
          className="h-9 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2 text-xs text-[var(--color-text)]"
        >
          <option value="date">Date</option>
          <option value="distance">Distance</option>
          <option value="hr">FC moyenne</option>
        </select>
        {type ? <input type="hidden" name="type" value={type} /> : null}
        <button
          type="submit"
          className="h-9 rounded-lg border border-[var(--color-border-strong)] px-3 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]"
        >
          Filtrer
        </button>
      </form>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Link
          href={{ pathname: "/activites", query: { q, sort } }}
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
              href={{ pathname: "/activites", query: { type: t.type, q, sort } }}
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

      {page.length === 0 ? (
        <Card className="mt-4 p-4">
          <p className="text-sm font-medium">Aucune activité</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Connecter Strava depuis les réglages pour lancer l&apos;import de l&apos;historique.
          </p>
        </Card>
      ) : (
        <div className="mt-4 space-y-6">
          {weeks.map((week) => {
            const runKm = week.items.filter((a) => isRun(a.type)).reduce((s, a) => s + a.distanceM, 0) / 1000;
            const rideKm =
              week.items.filter((a) => /ride|bike|cycl/i.test(a.type)).reduce((s, a) => s + a.distanceM, 0) / 1000;
            return (
              <section key={week.weekStart}>
                <h2 className="tabular text-xs font-medium text-[var(--color-muted)]">
                  {formatDayShort(week.weekStart)} – {formatDayShort(week.weekEnd)} ·{" "}
                  {runKm.toFixed(2)} km course · {rideKm.toFixed(2)} km vélo · {week.items.length} sortie
                  {week.items.length > 1 ? "s" : ""}
                </h2>
                <div className="mt-2 divide-y divide-[var(--color-border)] rounded-[var(--radius-card)] border border-[var(--color-border)]">
                  {week.items.map((a) => {
                    const running = isRun(a.type);
                    const secondsByZone = zonesByActivity.get(a.id) ?? null;
                    const match = planMatchStatus(a.plannedWorkout?.targetHrZone, secondsByZone);
                    return (
                      <Link
                        key={a.id}
                        href={{ pathname: `/activites/${a.id}` }}
                        className="flex items-center gap-3 p-3 transition-colors duration-[var(--duration-fast)] hover:bg-[var(--color-surface-2)] sm:gap-4"
                      >
                        <TraceThumb tracePath={tracePathByActivity.get(a.id) ?? null} type={a.type} size={64} className="shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {match ? (
                              <>
                                <span
                                  aria-hidden
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ backgroundColor: match === "in-zone" ? "var(--color-ok)" : "var(--color-warn)" }}
                                  title={match === "in-zone" ? "Dans la zone prescrite" : "Hors zone prescrite"}
                                />
                                {/* Jamais la couleur seule : un `title` seul n'est pas fiable au clavier/lecteur d'écran. */}
                                <span className="sr-only">
                                  {match === "in-zone" ? "Dans la zone prescrite. " : "Hors zone prescrite. "}
                                </span>
                              </>
                            ) : null}
                            <p className="truncate text-sm font-medium">
                              {normalizeActivityName(a.name, a.type, toLocalHour(a.startedAt))}
                            </p>
                          </div>
                          <p className="mt-0.5 text-xs text-[var(--color-muted)]">{formatInstant(a.startedAt)}</p>
                          <div className="tabular mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-muted)]">
                            {a.distanceM > 0 ? (
                              <>
                                <span>{formatDistance(a.distanceM)}</span>
                                <span>
                                  {running ? formatPace(paceFromSpeed(a.avgSpeedMps)) : formatClock(a.movingTimeS)}
                                </span>
                              </>
                            ) : (
                              <span className="font-medium text-[var(--color-text)]">
                                {formatClock(a.movingTimeS)}
                              </span>
                            )}
                            {a.avgHr ? <span>{a.avgHr} bpm</span> : null}
                          </div>
                          <ZoneBar secondsByZone={secondsByZone} zones={hrZones} legend={false} className="mt-1.5 max-w-[220px]" />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {hasMore ? (
        <div className="mt-4 text-center">
          <Link
            href={{ pathname: "/activites", query: { type, q, sort, limit: limit + PAGE_SIZE } }}
            className="inline-flex h-9 items-center rounded-lg border border-[var(--color-border-strong)] px-4 text-xs text-[var(--color-text)] hover:bg-[var(--color-surface-2)]"
          >
            Charger plus
          </Link>
        </div>
      ) : null}
    </div>
  );
}
