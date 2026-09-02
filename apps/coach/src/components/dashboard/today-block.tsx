import Link from "next/link";
import type { PlannedWorkout } from "@prisma/client";
import { Badge } from "@/components/ui/badge.tsx";
import { HorizontalGauge } from "@/components/ui/horizontal-gauge.tsx";
import { WORKOUT_LABELS } from "@/components/plan/plan-view.tsx";
import type { ReadinessSnapshot } from "@/lib/metrics/repository.ts";
import { minutesToTime } from "@/lib/shifts/day.ts";
import { formatDistance, formatDuration, formatPace } from "@/lib/utils.ts";

const READINESS_COLOR: Record<ReadinessSnapshot["result"]["status"], string> = {
  frais: "var(--color-ok)",
  correct: "var(--color-warn)",
  prudence: "var(--color-danger)",
};

const READINESS_LABEL: Record<ReadinessSnapshot["result"]["status"], string> = {
  frais: "Frais",
  correct: "Correct",
  prudence: "Prudence",
};

type TodayShift = {
  code: string | null;
  label: string;
  isException: boolean;
  isReplacement: boolean;
  windows: Array<{ startMin: number; endMin: number }>;
};

/**
 * Le bloc dominant de l'accueil : « où j'en suis dans mon cycle, qu'est-ce
 * que je fais aujourd'hui, suis-je en état de le faire ». Trois informations,
 * une seule carte, largement plus de surface que tout le reste de la page —
 * c'est la question que la CDC identifie comme LA vraie question posée en
 * ouvrant l'app à 5 h du matin.
 */
export function TodayBlock({
  shift,
  workout,
  readiness,
}: {
  shift: TodayShift;
  workout: (PlannedWorkout & { hrZoneRange: { fromBpm: number; toBpm: number } | null }) | null;
  readiness: ReadinessSnapshot | null;
}) {
  const sentence = buildShiftSentence(shift);
  const isRestDay = !workout || workout.type === "repos";
  const isDue = workout != null && workout.status === "upcoming" && !isRestDay;
  const meta = workout ? (WORKOUT_LABELS[workout.type] ?? null) : null;

  return (
    <section className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 md:p-6">
      <p className="text-sm text-[var(--color-muted)]">{sentence}</p>

      <div className="mt-3">
        {isRestDay ? (
          <div className="flex items-baseline gap-2">
            <span className="hero-title text-hero-lg text-[var(--color-text)]">Repos</span>
          </div>
        ) : (
          <div>
            <div className="flex flex-wrap items-baseline gap-2">
              <Link
                href="/plan"
                className="hero-title text-hero-lg hover:opacity-90"
                style={{ color: isDue ? "var(--color-signal)" : "var(--color-text)" }}
              >
                {workout.title}
              </Link>
              {meta ? <Badge tone={meta.tone}>{meta.label}</Badge> : null}
              {workout.status === "done" ? <Badge tone="ok">réalisée</Badge> : null}
            </div>
            <div className="tabular mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
              {workout.targetDistanceM != null ? <span>{formatDistance(workout.targetDistanceM)}</span> : null}
              {workout.targetDurationS != null ? <span>{formatDuration(workout.targetDurationS)}</span> : null}
              {workout.targetPaceMinSPerKm != null && workout.targetPaceMaxSPerKm != null ? (
                <span>
                  {formatPace(workout.targetPaceMaxSPerKm)} – {formatPace(workout.targetPaceMinSPerKm)}
                </span>
              ) : null}
              {workout.targetHrZone != null ? (
                <span>
                  Z{workout.targetHrZone}
                  {workout.hrZoneRange ? ` (${workout.hrZoneRange.fromBpm}–${workout.hrZoneRange.toBpm} bpm)` : ""}
                </span>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {readiness ? (
        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <HorizontalGauge
            label="VFC nocturne"
            value={readiness.hrv}
            unit="ms"
            baselineMean={readiness.hrvBaseline.mean}
            baselineSd={readiness.hrvBaseline.sd}
            verdict={READINESS_LABEL[readiness.result.status]}
            verdictColor={READINESS_COLOR[readiness.result.status]}
            countUpDelayMs={0}
          />
          <HorizontalGauge
            label="FC de repos"
            value={readiness.restingHr}
            unit="bpm"
            baselineMean={readiness.restingHrBaseline.mean}
            baselineSd={readiness.restingHrBaseline.sd}
            verdict={READINESS_LABEL[readiness.result.status]}
            verdictColor={READINESS_COLOR[readiness.result.status]}
            countUpDelayMs={60}
          />
        </div>
      ) : (
        <p className="mt-6 text-xs text-[var(--color-faint)]">
          Fraîcheur non disponible — nécessite le VFC et la FC de repos du jour, plus au moins
          sept jours de mesures antérieures pour établir une plage habituelle.
        </p>
      )}
    </section>
  );
}

function buildShiftSentence(shift: TodayShift): string {
  const windows = shift.windows
    .map((w) => `${minutesToTime(w.startMin)}–${minutesToTime(w.endMin)}`)
    .join(", ");
  const exception = shift.isException ? (shift.isReplacement ? " (remplacement)" : " (modifié)") : "";

  if (shift.code === null) {
    return windows
      ? `Repos aujourd'hui${exception} — créneau libre ${windows}.`
      : `Repos aujourd'hui${exception}.`;
  }

  return windows
    ? `Poste ${shift.label.toLowerCase()}${exception} — créneau libre ${windows}.`
    : `Poste ${shift.label.toLowerCase()}${exception} — aucun créneau exploitable aujourd'hui.`;
}
