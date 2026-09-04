import type { Goal, PlanRevision, PlannedWorkout, TrainingPlan } from "@prisma/client";
import { GenerateButton } from "@/components/plan/generate-button.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import type { PhaseOutput } from "@/lib/coach/schema.ts";
import { formatDayLong, formatDayShort, today } from "@/lib/time.ts";
import { formatDistance, formatDuration, formatPace, formatTimeRange } from "@/lib/utils.ts";
import { diffDays, mondayOf, weekdayLabel, type Day } from "@/lib/shifts/day.ts";

type PlanWithDetails = TrainingPlan & {
  workouts: PlannedWorkout[];
  revisions: PlanRevision[];
};

export const WORKOUT_LABELS: Record<
  string,
  { label: string; tone: "neutral" | "ok" | "warn" | "danger"; accent: string }
> = {
  endurance: { label: "Endurance", tone: "neutral", accent: "var(--color-faint)" },
  seuil: { label: "Seuil", tone: "warn", accent: "var(--color-warn)" },
  vma: { label: "VMA", tone: "danger", accent: "var(--color-danger)" },
  cotes: { label: "Côtes", tone: "danger", accent: "var(--color-serious)" },
  sortie_longue: { label: "Sortie longue", tone: "ok", accent: "var(--color-ok)" },
  recuperation: { label: "Récupération", tone: "neutral", accent: "var(--color-info)" },
  repos: { label: "Repos", tone: "neutral", accent: "var(--color-faint)" },
};

/** Rampe séquentielle déjà validée (zones FC) : les phases progressent dans
 * l'ordre, ce n'est pas une catégorisation arbitraire. */
const PHASE_RAMP = [
  "var(--chart-seq-1)",
  "var(--chart-seq-2)",
  "var(--chart-seq-3)",
  "var(--chart-seq-4)",
  "var(--chart-seq-5)",
];

function parseDataCompleteness(contextJson: string | null): string[] {
  if (!contextJson) return [];
  try {
    const parsed: unknown = JSON.parse(contextJson);
    const notes =
      parsed != null && typeof parsed === "object" && "dataCompleteness" in parsed
        ? (parsed as { dataCompleteness: unknown }).dataCompleteness
        : null;
    return Array.isArray(notes) ? notes.filter((n): n is string => typeof n === "string") : [];
  } catch {
    return [];
  }
}

function groupByWeek(workouts: PlannedWorkout[]): Array<[Day, PlannedWorkout[]]> {
  const groups = new Map<Day, PlannedWorkout[]>();
  for (const workout of [...workouts].sort((a, b) => a.day.localeCompare(b.day))) {
    const week = mondayOf(workout.day);
    const list = groups.get(week);
    if (list) list.push(workout);
    else groups.set(week, [workout]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

export function PlanView({ goal, plan }: { goal: Goal; plan: PlanWithDetails }) {
  const dataCompleteness = parseDataCompleteness(plan.contextJson);
  const phases: PhaseOutput[] = (() => {
    try {
      return JSON.parse(plan.phasesJson) as PhaseOutput[];
    } catch {
      return [];
    }
  })();
  const weeks = groupByWeek(plan.workouts);
  const revisions = [...plan.revisions].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const now = today();
  const totalDays = Math.max(1, diffDays(plan.startDay, plan.endDay));
  const todayPct = Math.max(0, Math.min(100, (diffDays(plan.startDay, now) / totalDays) * 100));

  const goalTargetRange = formatTimeRange(goal.targetTimeMinS, goal.targetTimeMaxS);

  return (
    <div className="space-y-5">
      <Card elevated>
        <CardHeader
          title={goal.name}
          hint={`${formatDistance(goal.distanceM)} — ${formatDayLong(goal.day)}${goalTargetRange ? ` — visé : ${goalTargetRange}` : ""}`}
          action={<GenerateButton goalId={goal.id} mode="regenerate" />}
        />
      </Card>

      {dataCompleteness.length > 0 ? (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-warn)]/40 px-3 py-2 text-xs text-[var(--color-warn)]">
          <p className="font-medium">Données non disponibles à la génération — allures non entièrement vérifiées :</p>
          <ul className="mt-1 list-inside list-disc">
            {dataCompleteness.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {phases.length > 0 ? (
        <Card>
          <CardHeader title="Périodisation" hint="Position du jour marquée sur la frise." />
          <CardBody>
            <div className="relative flex h-3 overflow-hidden rounded-[var(--radius-pill)]">
              {phases.map((phase, i) => {
                const span = Math.max(1, diffDays(phase.startDay, phase.endDay));
                return (
                  <div
                    key={`${phase.name}-${phase.startDay}`}
                    className="h-full"
                    style={{
                      width: `${(span / totalDays) * 100}%`,
                      backgroundColor: PHASE_RAMP[i % PHASE_RAMP.length],
                    }}
                    title={`${phase.name} — ${formatDayShort(phase.startDay)} à ${formatDayShort(phase.endDay)}`}
                  />
                );
              })}
              <div
                className="absolute inset-y-0 w-0.5 bg-[var(--color-text)]"
                style={{ left: `${todayPct}%` }}
                title={`Aujourd'hui — ${formatDayShort(now)}`}
              />
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {phases.map((phase, i) => (
                <div key={`${phase.name}-${phase.startDay}`} className="flex gap-2">
                  <span
                    className="mt-1 h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: PHASE_RAMP[i % PHASE_RAMP.length] }}
                  />
                  <div>
                    <div className="text-xs font-medium capitalize text-[var(--color-text)]">
                      {phase.name}
                    </div>
                    <div className="text-[11px] text-[var(--color-muted)]">
                      {formatDayShort(phase.startDay)} – {formatDayShort(phase.endDay)}
                    </div>
                    <p className="mt-1 text-xs text-[var(--color-muted)]">{phase.focus}</p>
                    {phase.weeklyVolumeKm ? (
                      <div className="mt-1 text-[11px] text-[var(--color-faint)]">
                        ~{phase.weeklyVolumeKm} km/semaine
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Raisonnement" hint="Ce que le modèle a produit, conservé tel quel." />
        <CardBody className="space-y-4">
          {revisions.map((revision) => (
            <p key={revision.id} className="whitespace-pre-wrap text-xs text-[var(--color-muted)]">
              {revision.reasoning}
            </p>
          ))}
        </CardBody>
      </Card>

      <div className="space-y-4">
        {weeks.map(([weekStart, workouts]) => (
          <Card key={weekStart}>
            <CardHeader title={`Semaine du ${formatDayShort(weekStart)}`} />
            <CardBody className="divide-y divide-[var(--color-border)] p-0">
              {workouts.map((workout, i) => {
                const meta = WORKOUT_LABELS[workout.type] ?? {
                  label: workout.type,
                  tone: "neutral" as const,
                  accent: "var(--color-faint)",
                };
                return (
                  <div
                    key={workout.id}
                    className="stagger-item flex flex-wrap items-center gap-2 border-l-2 px-4 py-2.5 text-xs"
                    style={{ borderColor: meta.accent, "--stagger-index": i } as React.CSSProperties}
                  >
                    <span className="w-20 shrink-0 text-[var(--color-faint)]">
                      {weekdayLabel(workout.day)} {formatDayShort(workout.day)}
                    </span>
                    <Badge tone={meta.tone}>{meta.label}</Badge>
                    <span className="font-medium">{workout.title}</span>
                    {workout.isKeySession ? <Badge tone="info">clé</Badge> : null}
                    {workout.isProvisional ? (
                      <Badge tone="neutral" title="Posée sur un jour de repos théorique — peut sauter en cas de remplacement">
                        provisoire
                      </Badge>
                    ) : null}
                    <span className="ml-auto flex gap-3 text-[var(--color-muted)]">
                      {workout.targetDurationS ? <span>{formatDuration(workout.targetDurationS)}</span> : null}
                      {workout.targetDistanceM ? <span>{formatDistance(workout.targetDistanceM)}</span> : null}
                      {workout.targetPaceMinSPerKm && workout.targetPaceMaxSPerKm ? (
                        <span>
                          {formatPace(workout.targetPaceMaxSPerKm)}–{formatPace(workout.targetPaceMinSPerKm)}
                        </span>
                      ) : null}
                    </span>
                  </div>
                );
              })}
            </CardBody>
          </Card>
        ))}
      </div>
    </div>
  );
}
