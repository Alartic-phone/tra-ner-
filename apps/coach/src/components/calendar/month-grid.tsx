"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Loader2, Moon, RotateCcw, X } from "lucide-react";
import { updateShifts } from "@/app/(app)/calendrier/actions.ts";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { cn, formatDistance } from "@/lib/utils.ts";
import { formatDayLong } from "@/lib/time.ts";
import type { ShiftTiming } from "@/lib/shifts/types.ts";

export type CalendarDay = {
  day: string;
  code: string | null;
  theoreticalCode: string | null;
  isException: boolean;
  isReplacement: boolean;
  isFreed: boolean;
  inMonth: boolean;
  isToday: boolean;
  maxSessionMin: number;
  allowsQuality: boolean;
  allowsLongRun: boolean;
  blockers: string[];
  activities: { id: string; name: string; distanceM: number; movingTimeS: number }[];
  planned: {
    id: string;
    type: string;
    title: string;
    status: string;
    isProvisional: boolean;
    isKeySession: boolean;
  }[];
};

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

/**
 * Vue mensuelle superposant postes, séances planifiées et séances réalisées.
 *
 * La saisie d'un remplacement est le geste le plus fréquent de l'application
 * et se fait souvent en vitesse, depuis le téléphone : elle tient en deux
 * appuis (la case, puis le type de poste). Aucun formulaire, aucune page
 * dédiée. La sélection de plage est un mode explicite, pour rester
 * découvrable sans dépendre d'un appui long.
 */
export function MonthGrid({
  days,
  timings,
}: {
  days: CalendarDay[];
  timings: ShiftTiming[];
}) {
  const [selection, setSelection] = useState<{ from: string; to: string } | null>(null);
  const [rangeMode, setRangeMode] = useState(false);
  const [rangeStart, setRangeStart] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const byCode = new Map(timings.map((t) => [t.code, t]));

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

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
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
        {rangeMode ? (
          <span className="text-xs text-[var(--color-muted)]">
            {rangeStart ? "Choisir le dernier jour" : "Choisir le premier jour"}
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-border)]">
        {WEEKDAYS.map((label, i) => (
          <div
            key={i}
            className="bg-[var(--color-surface)] py-1.5 text-center text-[11px] text-[var(--color-muted)]"
          >
            {label}
          </div>
        ))}

        {days.map((d) => {
          const timing = d.code ? byCode.get(d.code) : undefined;
          const isSelected = selection && d.day >= selection.from && d.day <= selection.to;
          const isRangeAnchor = rangeStart === d.day;

          return (
            <button
              key={d.day}
              type="button"
              onClick={() => onDayClick(d.day)}
              aria-label={`${formatDayLong(d.day)} — ${timing?.label ?? "repos"}`}
              className={cn(
                "relative min-h-[74px] bg-[var(--color-surface)] p-1 text-left transition-colors md:min-h-[96px]",
                !d.inMonth && "opacity-40",
                (isSelected || isRangeAnchor) && "ring-2 ring-inset ring-[var(--color-accent)]",
                "hover:bg-[var(--color-surface-2)]",
              )}
            >
              <div className="flex items-start justify-between">
                <span
                  className={cn(
                    "tabular text-[11px]",
                    d.isToday
                      ? "rounded bg-[var(--color-accent)] px-1 font-semibold text-[#06101f]"
                      : "text-[var(--color-muted)]",
                  )}
                >
                  {Number(d.day.slice(8, 10))}
                </span>
                {d.code ? (
                  <span
                    className="rounded px-1 text-[10px] font-semibold leading-4 text-white"
                    style={{ backgroundColor: timing?.color ?? "#64748b" }}
                    title={timing?.label ?? d.code}
                  >
                    {d.code}
                  </span>
                ) : null}
              </div>

              {d.isException ? (
                <div className="mt-0.5 flex items-center gap-0.5 text-[9px] text-[var(--color-warn)]">
                  <AlertTriangle size={9} aria-hidden />
                  {d.isReplacement ? "remplacement" : d.isFreed ? "libéré" : "modifié"}
                </div>
              ) : null}

              <div className="mt-1 space-y-0.5">
                {d.planned.map((p) => (
                  <div
                    key={p.id}
                    className={cn(
                      "truncate rounded px-1 text-[10px] leading-4",
                      p.isProvisional
                        ? "border border-dashed border-[var(--color-border-strong)] text-[var(--color-muted)]"
                        : "bg-[var(--color-accent-soft)] text-[var(--color-text)]",
                      p.status === "missed" && "line-through opacity-60",
                    )}
                    title={
                      p.isProvisional
                        ? `${p.title} — séance provisoire (jour de repos théorique)`
                        : p.title
                    }
                  >
                    {p.isKeySession ? "★ " : ""}
                    {p.title}
                  </div>
                ))}
                {d.activities.map((a) => (
                  <div
                    key={a.id}
                    className="tabular truncate rounded bg-[var(--color-ok)]/15 px-1 text-[10px] leading-4 text-[var(--color-ok)]"
                    title={a.name}
                  >
                    <Check size={9} className="mr-0.5 inline" aria-hidden />
                    {formatDistance(a.distanceM)}
                  </div>
                ))}
              </div>

              {!d.allowsLongRun && d.code === null ? (
                <Moon
                  size={9}
                  className="absolute bottom-1 right-1 text-[var(--color-faint)]"
                  aria-label="Sortie longue impossible ce jour"
                />
              ) : null}
            </button>
          );
        })}
      </div>

      {selection ? (
        <ShiftPicker
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

function ShiftPicker({
  selection,
  selected,
  timings,
  pending,
  error,
  onApply,
  onClose,
}: {
  selection: { from: string; to: string };
  selected: CalendarDay[];
  timings: ShiftTiming[];
  pending: boolean;
  error: string | null;
  onApply: (code: string | null, reset?: boolean) => void;
  onClose: () => void;
}) {
  const single = selection.from === selection.to;
  const day = selected[0];
  const hasException = selected.some((d) => d.isException);

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 md:inset-0 md:flex md:items-center md:justify-center md:bg-black/50">
      <div className="rounded-t-xl border-t border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:w-full md:max-w-sm md:rounded-xl md:border">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium">
              {single
                ? formatDayLong(selection.from)
                : `${selected.length} jours sélectionnés`}
            </h3>
            {single && day ? (
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                Cycle théorique :{" "}
                {day.theoreticalCode
                  ? (timings.find((t) => t.code === day.theoreticalCode)?.label ??
                    day.theoreticalCode)
                  : "repos"}
                {day.maxSessionMin > 0
                  ? ` · ${day.maxSessionMin} min disponibles`
                  : " · aucun créneau"}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="p-1">
            <X size={16} />
          </button>
        </div>

        {single && day && day.blockers.length > 0 ? (
          <ul className="mt-2 space-y-0.5">
            {day.blockers.map((b) => (
              <li key={b} className="text-[11px] text-[var(--color-warn)]">
                {b}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-2">
          {timings.map((t) => (
            <Button
              key={t.code}
              variant="outline"
              disabled={pending}
              onClick={() => onApply(t.code)}
              className="justify-start"
            >
              <span
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: t.color ?? "#64748b" }}
                aria-hidden
              />
              {t.label}
              <span className="ml-auto text-[10px] text-[var(--color-muted)]">
                {t.isWork ? `${t.startTime}–${t.endTime}` : ""}
              </span>
            </Button>
          ))}
          <Button variant="outline" disabled={pending} onClick={() => onApply(null)}>
            Repos
          </Button>
          {hasException ? (
            <Button variant="ghost" disabled={pending} onClick={() => onApply(null, true)}>
              <RotateCcw size={14} aria-hidden />
              Rétablir le cycle
            </Button>
          ) : null}
        </div>

        {pending ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <Loader2 size={12} className="animate-spin" aria-hidden />
            Enregistrement…
          </p>
        ) : null}
        {error ? <p className="mt-3 text-xs text-[var(--color-danger)]">{error}</p> : null}

        {single && day && day.activities.length > 0 ? (
          <div className="mt-3 border-t border-[var(--color-border)] pt-3">
            {day.activities.map((a) => (
              <Link
                key={a.id}
                href={{ pathname: `/activites/${a.id}` }}
                className="flex items-center justify-between py-1 text-xs hover:underline"
              >
                <span className="truncate">{a.name}</span>
                <Badge tone="ok">{formatDistance(a.distanceM)}</Badge>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
