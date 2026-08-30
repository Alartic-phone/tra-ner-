import { CircleAlert, CircleCheck, TriangleAlert } from "lucide-react";
import type { ReadinessResult, ReadinessStatus } from "@/lib/metrics/readiness.ts";
import { formatDayLong } from "@/lib/time.ts";
import type { Day } from "@/lib/shifts/day.ts";

const STATUS_META: Record<
  ReadinessStatus,
  { label: string; message: string; color: string; soft: string; Icon: typeof CircleCheck }
> = {
  frais: {
    label: "Frais",
    message: "VFC et FC de repos dans la norme habituelle. Le terrain est favorable pour pousser.",
    color: "var(--color-ok)",
    soft: "color-mix(in oklab, var(--color-ok) 14%, transparent)",
    Icon: CircleCheck,
  },
  correct: {
    label: "Correct",
    message: "Léger écart par rapport à la normale. Rien d'alarmant, mais pas le jour pour forcer.",
    color: "var(--color-warn)",
    soft: "color-mix(in oklab, var(--color-warn) 14%, transparent)",
    Icon: TriangleAlert,
  },
  prudence: {
    label: "Prudence",
    message:
      "VFC nettement sous la normale ou FC de repos élevée. Une séance facile ou du repos vaut mieux qu'une séance forcée.",
    color: "var(--color-danger)",
    soft: "color-mix(in oklab, var(--color-danger) 14%, transparent)",
    Icon: CircleAlert,
  },
};

/**
 * Bannière de fraîcheur — répond à « suis-je en forme aujourd'hui ? » en un
 * coup d'œil. Signal d'entraînement, pas un avis médical : le texte reste
 * toujours une invitation à la prudence, jamais une consigne d'arrêt.
 */
export function ReadinessBanner({
  data,
  today,
}: {
  data: { result: ReadinessResult; hrv: number; restingHr: number; measuredDay: Day } | null;
  today: Day;
}) {
  if (!data) {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <span className="text-xs text-[var(--color-faint)]">
          Fraîcheur du jour non disponible — nécessite le VFC et la FC de repos du jour, plus au
          moins 7 jours de mesures antérieures pour établir une plage habituelle.
        </span>
      </div>
    );
  }

  const { result, hrv, restingHr, measuredDay } = data;
  const meta = STATUS_META[result.status];
  const { Icon } = meta;
  const isStale = measuredDay !== today;

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border px-4 py-3"
      style={{ borderColor: `color-mix(in oklab, ${meta.color} 40%, transparent)`, backgroundColor: meta.soft }}
    >
      <Icon size={20} style={{ color: meta.color }} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold" style={{ color: meta.color }}>
          {meta.label}
          {isStale ? (
            <span className="ml-2 text-xs font-normal text-[var(--color-muted)]">
              (mesure du {formatDayLong(measuredDay)}, pas encore de VFC aujourd&apos;hui)
            </span>
          ) : null}
        </p>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">{meta.message}</p>
      </div>
      <div className="tabular flex gap-4 text-xs text-[var(--color-muted)]">
        <span>
          VFC <span className="font-medium text-[var(--color-text)]">{hrv.toFixed(0)} ms</span>{" "}
          <span
            style={{ color: result.hrvDeltaPct < 0 ? "var(--color-danger)" : "var(--color-ok)" }}
          >
            ({result.hrvDeltaPct >= 0 ? "+" : ""}
            {result.hrvDeltaPct.toFixed(0)} %)
          </span>
        </span>
        <span>
          FC repos <span className="font-medium text-[var(--color-text)]">{restingHr} bpm</span>{" "}
          <span
            style={{
              color: result.restingHrDeltaBpm > 0 ? "var(--color-danger)" : "var(--color-ok)",
            }}
          >
            ({result.restingHrDeltaBpm >= 0 ? "+" : ""}
            {result.restingHrDeltaBpm.toFixed(0)})
          </span>
        </span>
      </div>
    </div>
  );
}
