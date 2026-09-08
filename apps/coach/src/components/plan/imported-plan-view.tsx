import type { ImportedPlanSession } from "@prisma/client";
import { Card, CardHeader } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { formatDayShort, today } from "@/lib/time.ts";
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

function WeekCard({
  weekStart,
  sessions,
  isCurrent,
  todayDay,
  shiftLabelByDay,
}: {
  weekStart: Day;
  sessions: ImportedPlanSession[];
  isCurrent: boolean;
  todayDay: Day;
  shiftLabelByDay: ReadonlyMap<Day, string>;
}) {
  return (
    <Card className={isCurrent ? "border-[var(--color-accent)]" : undefined}>
      <CardHeader
        title={`Semaine du ${formatDayShort(weekStart)}`}
        action={isCurrent ? <Badge tone="ok">Semaine en cours</Badge> : undefined}
      />
      <div className="divide-y divide-[var(--color-border)]">
        {sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            isToday={session.day === todayDay}
            shiftLabel={shiftLabelByDay.get(session.day)}
          />
        ))}
      </div>
    </Card>
  );
}

/**
 * Affiche les séances importées par CSV, groupées par semaine — même
 * disposition (carte de semaine, ligne par séance) que le plan généré par
 * l'API Claude (`PlanView`), réutilisant les mêmes primitives (`Card`,
 * `Badge`), mais un composant distinct : `ImportedPlanSession` n'a ni
 * objectif de course, ni phases, ni raisonnement — l'essentiel de `PlanView`
 * ne s'appliquerait qu'à des sections vides.
 *
 * Ordre de lecture (cahier des charges §2.4) : la semaine en cours d'abord,
 * dépliée et distinguée visuellement (bordure + badge), puis les semaines à
 * venir dans l'ordre chronologique, dépliées. Les semaines passées sont
 * repliées par défaut sous un `<details>` natif indiquant leur nombre — la
 * page ne grossit plus sans fin avec l'historique.
 *
 * Le statut FAIT décrit une intention réalisée, jamais une activité :
 * aucun rapprochement avec Strava n'est tenté ici, les deux couches
 * s'affichent côte à côte sans se mélanger. Chaque ligne reste modifiable
 * ou supprimable à la main (SessionRow) : l'import CSV est le mécanisme
 * principal, pas le seul chemin d'écriture.
 */
export function ImportedPlanView({
  sessions,
  shiftLabelByDay = new Map(),
}: {
  sessions: ImportedPlanSession[];
  /** Poste réel par jour (lib/shifts/), jamais dérivé du CSV — cf. `plan/page.tsx`. */
  shiftLabelByDay?: ReadonlyMap<Day, string>;
}) {
  if (sessions.length === 0) return null;
  const weeks = groupByWeek(sessions);
  const todayDay = today();
  const currentWeekStart = mondayOf(todayDay);

  const past = weeks.filter(([weekStart]) => weekStart < currentWeekStart);
  const currentAndFuture = weeks.filter(([weekStart]) => weekStart >= currentWeekStart);

  return (
    <div className="space-y-4">
      {currentAndFuture.map(([weekStart, weekSessions]) => (
        <WeekCard
          key={weekStart}
          weekStart={weekStart}
          sessions={weekSessions}
          isCurrent={weekStart === currentWeekStart}
          todayDay={todayDay}
          shiftLabelByDay={shiftLabelByDay}
        />
      ))}

      {past.length > 0 ? (
        <details>
          <summary className="cursor-pointer py-1 text-xs font-medium text-[var(--color-muted)] hover:text-[var(--color-text)]">
            {past.length} semaine{past.length > 1 ? "s" : ""} passée{past.length > 1 ? "s" : ""}
          </summary>
          <div className="mt-4 space-y-4">
            {[...past].reverse().map(([weekStart, weekSessions]) => (
              <WeekCard
                key={weekStart}
                weekStart={weekStart}
                sessions={weekSessions}
                isCurrent={false}
                todayDay={todayDay}
                shiftLabelByDay={shiftLabelByDay}
              />
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}
