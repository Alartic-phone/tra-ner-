import Link from "next/link";
import type { PlannedWorkout } from "@prisma/client";
import { Badge, Unavailable } from "@/components/ui/badge.tsx";
import { Card, CardHeader } from "@/components/ui/card.tsx";
import { WORKOUT_LABELS } from "@/components/plan/plan-view.tsx";
import { formatDistance, formatDuration, formatPace } from "@/lib/utils.ts";

/**
 * Carte hero du dashboard : « qu'est-ce que je fais aujourd'hui ? ». Sans
 * séance planifiée, l'absence est explicite (aucun plan actif, ou jour de
 * repos) — jamais une case vide qui ressemble à un oubli d'affichage.
 */
export function TodaySessionCard({
  workout,
  hrZoneRange,
}: {
  workout: PlannedWorkout | null;
  hrZoneRange: { fromBpm: number; toBpm: number } | null;
}) {
  if (!workout) {
    return (
      <Card elevated className="flex flex-col">
        <CardHeader title="Séance du jour" />
        <div className="flex flex-1 flex-col items-start justify-center gap-2 px-4 py-6">
          <p className="text-sm text-[var(--color-muted)]">
            Aucune séance planifiée aujourd&apos;hui.
          </p>
          <Link href="/plan" className="text-xs text-[var(--color-accent)] hover:underline">
            Voir le plan →
          </Link>
        </div>
      </Card>
    );
  }

  const meta = WORKOUT_LABELS[workout.type] ?? {
    label: workout.type,
    tone: "neutral" as const,
    accent: "var(--color-faint)",
  };

  return (
    <Card elevated className="flex flex-col">
      <CardHeader
        title="Séance du jour"
        action={<Badge tone={meta.tone}>{meta.label}</Badge>}
      />
      <div className="px-4 py-3">
        <p className="text-lg font-semibold">{workout.title}</p>
        {workout.description ? (
          <p className="mt-1 text-xs text-[var(--color-muted)]">{workout.description}</p>
        ) : null}

        <div className="tabular mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm">
          {workout.targetDistanceM != null ? (
            <span>
              <span className="text-[var(--color-faint)]">Distance </span>
              {formatDistance(workout.targetDistanceM)}
            </span>
          ) : null}
          {workout.targetDurationS != null ? (
            <span>
              <span className="text-[var(--color-faint)]">Durée </span>
              {formatDuration(workout.targetDurationS)}
            </span>
          ) : null}
          {workout.targetPaceMinSPerKm != null && workout.targetPaceMaxSPerKm != null ? (
            <span>
              <span className="text-[var(--color-faint)]">Allure </span>
              {formatPace(workout.targetPaceMaxSPerKm)} – {formatPace(workout.targetPaceMinSPerKm)}
            </span>
          ) : null}
          {workout.targetHrZone != null ? (
            <span>
              <span className="text-[var(--color-faint)]">Zone </span>
              Z{workout.targetHrZone}
              {hrZoneRange ? ` (${hrZoneRange.fromBpm}–${hrZoneRange.toBpm} bpm)` : ""}
            </span>
          ) : null}
        </div>

        {workout.targetDistanceM == null &&
        workout.targetDurationS == null &&
        workout.targetPaceMinSPerKm == null &&
        workout.targetHrZone == null ? (
          <p className="mt-2 text-xs">
            <Unavailable reason="Séance sans consigne chiffrée" />
          </p>
        ) : null}

        <div className="mt-3">
          <Badge tone={workout.status === "done" ? "ok" : workout.status === "missed" ? "danger" : "neutral"}>
            {workout.status === "upcoming"
              ? "à venir"
              : workout.status === "done"
                ? "réalisée"
                : workout.status === "missed"
                  ? "manquée"
                  : "déplacée"}
          </Badge>
        </div>
      </div>
    </Card>
  );
}
