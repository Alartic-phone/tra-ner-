import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { Card, CardHeader } from "@/components/ui/card.tsx";
import { ActivityCard } from "@/components/activities/activity-card.tsx";
import { sportColor } from "@/components/activities/activity-icon.tsx";
import { loadPersonalRecordsByActivity, loadZoneSecondsByActivity } from "@/lib/metrics/repository.ts";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

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
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {activities.map((a, i) => (
            <ActivityCard
              key={a.id}
              activity={a}
              secondsByZone={zonesByActivity.get(a.id) ?? null}
              isPersonalRecord={(recordsByActivity.get(a.id) ?? []).length > 0}
              staggerIndex={i}
            />
          ))}
        </div>
      )}

      {pages > 1 ? (
        <div className="mt-3 flex items-center justify-between text-xs">
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
