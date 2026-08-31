"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { updateShifts } from "@/app/(app)/calendrier/actions.ts";
import { Button } from "@/components/ui/button.tsx";
import type { ShiftTiming } from "@/lib/shifts/types.ts";
import { MonthGrid } from "./month-grid.tsx";
import { WeekGrid } from "./week-grid.tsx";
import { DayPanel } from "./day-panel.tsx";

export type CalendarDay = {
  day: string;
  code: string | null;
  theoreticalCode: string | null;
  isException: boolean;
  isReplacement: boolean;
  isFreed: boolean;
  inMonth: boolean;
  isToday: boolean;
  /** Vrai pour tout jour strictement antérieur à aujourd'hui. */
  isPast: boolean;
  maxSessionMin: number;
  allowsQuality: boolean;
  allowsLongRun: boolean;
  blockers: string[];
  /** Créneaux réellement libres (minutes depuis minuit), triés. Sert au fond
   * vert de la vue semaine — jamais recalculé côté client. */
  windows: { startMin: number; endMin: number }[];
  /** Jour de la course d'un objectif actif — mis en avant dans la grille. */
  isRaceDay: boolean;
  /** Volume cible (km) de la phase de plan actif couvrant la semaine de ce
   * jour, si elle en chiffre un. `null` sinon — jamais une cible inventée. */
  weeklyVolumeTargetKm: number | null;
  activities: {
    id: string;
    name: string;
    distanceM: number;
    movingTimeS: number;
    type: string;
    /** Minute réelle de départ (Europe/Paris) depuis minuit. */
    startMin: number;
  }[];
  planned: {
    id: string;
    type: string;
    title: string;
    status: string;
    isProvisional: boolean;
    isKeySession: boolean;
    /** Activité rapprochée si la séance a été réalisée. */
    activityId: string | null;
  }[];
};

/**
 * Vue calendrier : bascule entre la grille mensuelle (rythme du cycle,
 * volume par semaine) et la vue semaine (créneaux disponibles, « quand
 * est-ce que je m'entraîne cette semaine »). Les deux partagent le même
 * panneau de détail et le même geste de saisie de remplacement.
 */
export function CalendarView({
  days,
  timings,
  today,
}: {
  days: CalendarDay[];
  timings: ShiftTiming[];
  today: string;
}) {
  const [view, setView] = useState<"month" | "week">("month");
  const [selection, setSelection] = useState<{ from: string; to: string } | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const weeks = useMemo(() => {
    const out: CalendarDay[][] = [];
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7));
    return out;
  }, [days]);

  const defaultWeekIndex = Math.max(
    0,
    weeks.findIndex((w) => w.some((d) => d.day === today)),
  );
  const [weekIndex, setWeekIndex] = useState(defaultWeekIndex);

  function onDayClick(day: string) {
    setError(null);
    if (!rangeMode) {
      setSelection({ from: day, to: day });
      return;
    }
    if (rangeStart === null) {
      setRangeStart(day);
      setSelection(null);
      return;
    }
    const from = rangeStart <= day ? rangeStart : day;
    const to = rangeStart <= day ? day : rangeStart;
    setRangeStart(null);
    setSelection({ from, to });
  }

  function apply(code: string | null, reset = false) {
    if (!selection) return;
    startTransition(async () => {
      const result = await updateShifts({ ...selection, code, reset });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSelection(null);
      setRangeMode(false);
    });
  }

  const selected = selection
    ? days.filter((d) => d.day >= selection.from && d.day <= selection.to)
    : [];

  const isSelected = (day: string) => selection != null && day >= selection.from && day <= selection.to;
  const isRangeAnchor = (day: string) => rangeStart === day;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 rounded-lg border border-[var(--color-border-strong)] p-0.5">
          <button
            type="button"
            onClick={() => setView("month")}
            className={
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--duration-fast)] " +
              (view === "month"
                ? "bg-[var(--color-accent)] text-[#06101f]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]")
            }
          >
            Mois
          </button>
          <button
            type="button"
            onClick={() => setView("week")}
            className={
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors duration-[var(--duration-fast)] " +
              (view === "week"
                ? "bg-[var(--color-accent)] text-[#06101f]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]")
            }
          >
            Semaine
          </button>
        </div>

        <div className="flex items-center gap-2">
          {view === "week" ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setWeekIndex((i) => Math.max(0, i - 1))}
                disabled={weekIndex === 0}
                aria-label="Semaine précédente"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border-strong)] disabled:opacity-40"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={() => setWeekIndex((i) => Math.min(weeks.length - 1, i + 1))}
                disabled={weekIndex === weeks.length - 1}
                aria-label="Semaine suivante"
                className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border-strong)] disabled:opacity-40"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          ) : (
            <Button
              size="sm"
              variant={rangeMode ? "default" : "outline"}
              onClick={() => {
                setRangeMode((v) => !v);
                setRangeStart(null);
                setSelection(null);
              }}
            >
              {rangeMode ? "Mode plage actif" : "Sélectionner une plage"}
            </Button>
          )}
        </div>
      </div>

      {view === "month" && rangeMode ? (
        <p className="mb-2 text-xs text-[var(--color-muted)]">
          {rangeStart ? "Choisir le dernier jour" : "Choisir le premier jour"}
        </p>
      ) : null}

      {view === "month" ? (
        <MonthGrid
          days={days}
          timings={timings}
          isSelected={isSelected}
          isRangeAnchor={isRangeAnchor}
          onDayClick={onDayClick}
        />
      ) : (
        <WeekGrid
          days={weeks[weekIndex] ?? []}
          timings={timings}
          today={today}
          isSelected={isSelected}
          onDayClick={onDayClick}
        />
      )}

      {selection ? (
        <DayPanel
          selection={selection}
          selected={selected}
          timings={timings}
          pending={pending}
          error={error}
          onApply={apply}
          onClose={() => setSelection(null)}
        />
      ) : null}
    </div>
  );
}
