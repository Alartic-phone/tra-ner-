import type { ImportedPlanSession } from "@prisma/client";
import { Card, CardHeader } from "@/components/ui/card.tsx";
import { formatDayShort } from "@/lib/time.ts";
import { mondayOf, type Day } from "@/lib/shifts/day.ts";
import { SessionRow } from "@/components/plan/session-row.tsx";

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
 * s'affichent côte à côte sans se mélanger. Chaque ligne reste modifiable
 * ou supprimable à la main (SessionRow) : l'import CSV est le mécanisme
 * principal, pas le seul chemin d'écriture.
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
            {weekSessions.map((session) => (
              <SessionRow key={session.id} session={session} />
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
