import Link from "next/link";
import { prisma } from "@/lib/db.ts";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { Card, CardHeader } from "@/components/ui/card.tsx";
import { formatClock, formatDistance, formatPace, paceFromSpeed } from "@/lib/utils.ts";
import { formatInstant } from "@/lib/time.ts";

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
          className={`rounded border px-2 py-1 text-xs ${
            type ? "border-[var(--color-border-strong)] text-[var(--color-muted)]" : "border-[var(--color-accent)] text-[var(--color-accent)]"
          }`}
        >
          Tout
        </Link>
        {types.map((t) => (
          <Link
            key={t.type}
            href={{ pathname: "/activites", query: { type: t.type } }}
            className={`rounded border px-2 py-1 text-xs ${
              type === t.type
                ? "border-[var(--color-accent)] text-[var(--color-accent)]"
                : "border-[var(--color-border-strong)] text-[var(--color-muted)]"
            }`}
          >
            {t.type} ({t._count.type})
          </Link>
        ))}
      </div>

      {activities.length === 0 ? (
        <Card className="mt-4">
          <CardHeader
            title="Aucune activité"
            hint="Connecter Strava depuis les réglages pour lancer l'import de l'historique."
          />
        </Card>
      ) : (
        <div className="mt-4 overflow-x-auto rounded-lg border border-[var(--color-border)]">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs text-[var(--color-muted)]">
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Séance</th>
                <th className="px-3 py-2 text-right font-medium">Distance</th>
                <th className="px-3 py-2 text-right font-medium">Durée</th>
                <th className="px-3 py-2 text-right font-medium">Allure</th>
                <th className="px-3 py-2 text-right font-medium">FC moy.</th>
                <th className="px-3 py-2 text-right font-medium">D+</th>
              </tr>
            </thead>
            <tbody className="tabular">
              {activities.map((a) => (
                <tr
                  key={a.id}
                  className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]"
                >
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--color-muted)]">
                    {formatInstant(a.startedAt)}
                  </td>
                  <td className="max-w-[220px] truncate px-3 py-2">
                    <Link href={{ pathname: `/activites/${a.id}` }} className="hover:underline">
                      {a.name}
                    </Link>
                    {!a.hasStreams ? (
                      <Badge className="ml-1.5" title="Flux détaillés non importés">
                        sans flux
                      </Badge>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right">{formatDistance(a.distanceM)}</td>
                  <td className="px-3 py-2 text-right">{formatClock(a.movingTimeS)}</td>
                  <td className="px-3 py-2 text-right">
                    {formatPace(paceFromSpeed(a.avgSpeedMps))}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {a.avgHr ?? <Unavailable reason="Aucun cardio sur cette séance" />}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {a.elevationGainM != null ? `${Math.round(a.elevationGainM)} m` : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
