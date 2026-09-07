import type { ReactNode } from "react";
import type { ImportedPlanSession } from "@prisma/client";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { Card, CardHeader } from "@/components/ui/card.tsx";
import { formatDayShort } from "@/lib/time.ts";
import { formatDistance, formatDuration } from "@/lib/utils.ts";
import { mondayOf, weekdayLabel, type Day } from "@/lib/shifts/day.ts";

function groupByWeek(sessions: ImportedPlanSession[]): Array<[Day, ImportedPlanSession[]]> {
  const groups = new Map<Day, ImportedPlanSession[]>();
  for (const session of [...sessions].sort((a, b) => a.day.localeCompare(b.day))) {
    const week = mondayOf(session.day);
    const list = groups.get(week);
    if (list) list.push(session);
    else groups.set(week, [session]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function hrRange(session: ImportedPlanSession): ReactNode {
  const { hrTargetMinBpm: min, hrTargetMaxBpm: max } = session;
  if (min == null && max == null) return <Unavailable reason="Aucune fourchette FC dans le fichier importé" />;
  if (min != null && max != null) return `${min}–${max} bpm`;
  return `${min ?? max} bpm`;
}

function detailsList(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split("|")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Affiche les séances importées par CSV, groupées par semaine — même
 * disposition (carte de semaine, ligne par séance) que le plan généré par
 * l'API Claude (`PlanView`), réutilisant les mêmes primitives (`Card`,
 * `Badge`), mais un composant distinct : `ImportedPlanSession` n'a ni
 * objectif de course, ni phases, ni raisonnement — l'essentiel de `PlanView`
 * ne s'appliquerait qu'à des sections vides.
 *
 * Le statut FAIT décrit une intention réalisée, jamais une activité :
 * aucun rapprochement avec Strava n'est tenté ici, les deux couches
 * s'affichent côte à côte sans se mélanger.
 */
export function ImportedPlanView({ sessions }: { sessions: ImportedPlanSession[] }) {
  if (sessions.length === 0) return null;
  const weeks = groupByWeek(sessions);

  return (
    <div className="space-y-4">
      {weeks.map(([weekStart, weekSessions]) => (
        <Card key={weekStart}>
          <CardHeader title={`Semaine du ${formatDayShort(weekStart)}`} />
          <div className="divide-y divide-[var(--color-border)]">
            {weekSessions.map((session) => {
              const muscu = detailsList(session.muscuDetails);
              const fractionne = detailsList(session.fractionneDetails);
              return (
                <div key={session.id} className="flex flex-wrap items-start gap-2 px-4 py-2.5 text-xs">
                  <span className="w-20 shrink-0 pt-0.5 text-[var(--color-faint)]">
                    {weekdayLabel(session.day)} {formatDayShort(session.day)}
                  </span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="neutral">{session.type}</Badge>
                      <Badge tone={session.status === "FAIT" ? "ok" : "neutral"}>
                        {session.status === "FAIT" ? "fait" : "à faire"}
                      </Badge>
                      <span className="text-[var(--color-muted)]">
                        {session.distanceM != null ? formatDistance(session.distanceM) : <Unavailable />}
                        {" · "}
                        {session.durationS != null ? formatDuration(session.durationS) : <Unavailable />}
                        {" · "}
                        {hrRange(session)}
                      </span>
                    </div>
                    {session.objective ? (
                      <p className="text-[var(--color-text)]">{session.objective}</p>
                    ) : null}
                    {muscu.length > 0 ? (
                      <ul className="list-inside list-disc text-[var(--color-muted)]">
                        {muscu.map((entry, i) => (
                          <li key={i}>{entry}</li>
                        ))}
                      </ul>
                    ) : null}
                    {fractionne.length > 0 ? (
                      <ul className="list-inside list-disc text-[var(--color-muted)]">
                        {fractionne.map((entry, i) => (
                          <li key={i}>{entry}</li>
                        ))}
                      </ul>
                    ) : null}
                    {session.notes ? (
                      <p className="text-[11px] text-[var(--color-faint)]">{session.notes}</p>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      ))}
    </div>
  );
}
