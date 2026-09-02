import { Card, CardHeader } from "@/components/ui/card.tsx";
import { Unavailable } from "@/components/ui/badge.tsx";
import { CountUp } from "@/components/ui/count-up.tsx";
import { formatClock, formatDistance } from "@/lib/utils.ts";

type Goal = { name: string; day: string; distanceM: number; targetTimeS: number | null };

export function GoalCountdown({ goal, daysUntil }: { goal: Goal | null; daysUntil: number }) {
  return (
    <Card>
      <CardHeader title="Prochaine course" />
      <div className="px-4 py-3">
        {goal ? (
          <>
            <p className="truncate text-sm font-medium">{goal.name}</p>
            <div className="tabular mt-1 flex items-baseline gap-1.5">
              <span className="hero-numeral text-hero-md">
                <CountUp value={daysUntil} delayMs={120} />
              </span>
              <span className="text-xs text-[var(--color-muted)]">
                jour{daysUntil > 1 ? "s" : ""}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--color-faint)]">
              {formatDistance(goal.distanceM)}
              {goal.targetTimeS ? ` · objectif ${formatClock(goal.targetTimeS)}` : ""}
            </p>
          </>
        ) : (
          <p className="text-xs">
            <Unavailable reason="Aucun objectif actif configuré" />
          </p>
        )}
      </div>
    </Card>
  );
}
