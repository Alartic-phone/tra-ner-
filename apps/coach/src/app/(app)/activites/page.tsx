import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { Card, CardHeader } from "@/components/ui/card.tsx";
import { ActivityFeedRow } from "@/components/activities/activity-feed-row.tsx";
import { sportColor } from "@/components/activities/activity-icon.tsx";
import { loadPersonalRecordsByActivity, loadZoneSecondsByActivity } from "@/lib/metrics/repository.ts";
import { mondayOf } from "@/lib/shifts/day.ts";
import { formatDayShort } from "@/lib/time.ts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 30;

export default async function ActivitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; type?: string }>;
}) {
  const { page: pageParam, type } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? "1") || 1);

  const where = type ? { type } : {};
  const [activities, total, types] = await Promise.all([
    prisma.activity.findMany({
      where,
      orderBy: { startedAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      include: { stream: { select: { tracePath: true, traceViewBox: true } } },
    }),
    prisma.activity.count({ where }),
    prisma.activity.groupBy({ by: ["type"], _count: { type: true } }),
  ]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const activityIds = activities.map((a) => a.id);
  const [zonesByActivity, recordsByActivity] = await Promise.all([
    loadZoneSecondsByActivity(activityIds),
    loadPersonalRecordsByActivity(activityIds),
  ]);

  // Groupé par semaine (lundi -> dimanche), dans l'ordre où les activités
  // arrivent déjà (décroissant) : chaque nouvelle semaine rencontrée ouvre
  // un nouveau groupe, un seul passage suffit.
  const weeks: Array<{ weekStart: string; activities: typeof activities }> = [];
  for (const a of activities) {
    const weekStart = mondayOf(a.startDay);
    const current = weeks[weeks.length - 1];
    if (current && current.weekStart === weekStart) {
      current.activities.push(a);
    } else {
      weeks.push({ weekStart, activities: [a] });
    }
  }

  let rowIndex = 0;

  return (
    <div className="mx-auto max-w-[1100px] p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold">Activités</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          {total} activité{total > 1 ? "s" : ""} importée{total > 1 ? "s" : ""}.
        </p>
      </header>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Link
          href="/activites"
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
              href={{ pathname: "/activites", query: { type: t.type } }}
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

      {activities.length === 0 ? (
        <Card className="mt-4">
          <CardHeader
            title="Aucune activité"
            hint="Connecter Strava depuis les réglages pour lancer l'import de l'historique."
          />
        </Card>
      ) : (
        <div className="mt-4 space-y-6">
          {weeks.map((week) => {
            const km = week.activities.reduce((sum, a) => sum + a.distanceM, 0) / 1000;
            return (
              <div key={week.weekStart}>
                <div className="tabular flex items-baseline justify-between px-3 text-xs text-[var(--color-muted)]">
                  <span className="font-medium text-[var(--color-text)]">
                    Semaine du {formatDayShort(week.weekStart)}
                  </span>
                  <span>
                    {week.activities.length} séance{week.activities.length > 1 ? "s" : ""} ·{" "}
                    {km.toFixed(1)} km
                  </span>
                </div>
                <div className="mt-2 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)]">
                  {week.activities.map((a) => (
                    <ActivityFeedRow
                      key={a.id}
                      activity={{
                        id: a.id,
                        name: a.name,
                        type: a.type,
                        startedAt: a.startedAt,
                        startDay: a.startDay,
                        distanceM: a.distanceM,
                        movingTimeS: a.movingTimeS,
                        avgSpeedMps: a.avgSpeedMps,
                        avgHr: a.avgHr,
                        tracePath: a.stream?.tracePath ?? null,
                        traceViewBox: a.stream?.traceViewBox ?? null,
                      }}
                      secondsByZone={zonesByActivity.get(a.id) ?? null}
                      isPersonalRecord={(recordsByActivity.get(a.id) ?? []).length > 0}
                      staggerIndex={rowIndex++}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 ? (
        <div className="mt-4 flex items-center justify-between text-xs">
          {page > 1 ? (
            <Link
              href={{ pathname: "/activites", query: { page: page - 1, ...(type ? { type } : {}) } }}
              className="text-[var(--color-accent)] hover:underline"
            >
              ← Précédent
            </Link>
          ) : (
            <span />
          )}
          <span className="text-[var(--color-muted)]">
            Page {page} sur {pages}
          </span>
          {page < pages ? (
            <Link
              href={{ pathname: "/activites", query: { page: page + 1, ...(type ? { type } : {}) } }}
              className="text-[var(--color-accent)] hover:underline"
            >
              Suivant →
            </Link>
          ) : (
            <span />
          )}
        </div>
      ) : null}
    </div>
  );
}
