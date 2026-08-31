import Link from "next/link";
import { Loader2, RotateCcw, X } from "lucide-react";
import { Badge } from "@/components/ui/badge.tsx";
import { Button } from "@/components/ui/button.tsx";
import { ActivityTypeIcon } from "@/components/activities/activity-icon.tsx";
import { minutesToTime } from "@/lib/shifts/day.ts";
import { formatDistance } from "@/lib/utils.ts";
import { formatDayLong } from "@/lib/time.ts";
import type { ShiftTiming } from "@/lib/shifts/types.ts";
import type { CalendarDay } from "./calendar-view.tsx";
import { SessionPill, mergeDaySessions } from "./session-pill.tsx";

/**
 * Panneau de détail d'un jour (feuille du bas sur mobile, boîte centrée sur
 * desktop). Sert aussi la sélection multi-jours, avec un contenu réduit
 * puisqu'il n'y a alors pas un jour unique à détailler.
 *
 * La déclaration d'un remplacement reste à deux appuis : la case (tap 1),
 * puis un poste dans la grille ci-dessous (tap 2). Le panneau qui s'ouvre est
 * plus riche qu'avant, mais la grille de postes reste visible d'emblée — rien
 * ne vient s'intercaler.
 */
export function DayPanel({
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
  const timing = day?.code ? timings.find((t) => t.code === day.code) : undefined;
  const sessions = day ? mergeDaySessions(day) : [];

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 md:inset-0 md:flex md:items-center md:justify-center md:bg-black/50">
      <div className="max-h-[85vh] overflow-y-auto rounded-t-[var(--radius-card)] border-t border-[var(--color-border-strong)] bg-[var(--color-surface)] p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:w-full md:max-w-sm md:rounded-[var(--radius-card)] md:border">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-medium">
              {single ? formatDayLong(selection.from) : `${selected.length} jours sélectionnés`}
            </h3>
            {single && day ? (
              <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                {timing
                  ? `${timing.label} · ${timing.startTime}–${timing.endTime}`
                  : day.theoreticalCode
                    ? `Repos (remplace ${
                        timings.find((t) => t.code === day.theoreticalCode)?.label ??
                        day.theoreticalCode
                      })`
                    : "Repos"}
              </p>
            ) : null}
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="p-1">
            <X size={16} />
          </button>
        </div>

        {single && day ? (
          <div className="mt-3 space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-muted)]">Disponibilité</span>
              <span className="tabular">
                {day.maxSessionMin > 0 ? `${day.maxSessionMin} min max` : "aucun créneau"}
              </span>
            </div>
            {day.windows.length > 0 ? (
              <div className="flex items-center justify-between">
                <span className="text-[var(--color-muted)]">Créneaux</span>
                <span className="tabular text-right">
                  {day.windows
                    .map((w) => `${minutesToTime(w.startMin)}–${minutesToTime(w.endMin)}`)
                    .join(", ")}
                </span>
              </div>
            ) : null}
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-muted)]">Séance de qualité</span>
              <span>{day.allowsQuality ? "possible" : "non"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--color-muted)]">Sortie longue</span>
              <span>{day.allowsLongRun ? "possible" : "non"}</span>
            </div>
          </div>
        ) : null}

        {single && day && day.blockers.length > 0 ? (
          <ul className="mt-2 space-y-0.5">
            {day.blockers.map((b) => (
              <li key={b} className="text-[11px] text-[var(--color-warn)]">
                {b}
              </li>
            ))}
          </ul>
        ) : null}

        {single && sessions.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-1 border-t border-[var(--color-border)] pt-3">
            {sessions.map((s) => (
              <SessionPill key={`${s.kind}-${s.id}`} item={s} className="max-w-full" />
            ))}
          </div>
        ) : null}

        <p className="mt-3 text-xs font-medium text-[var(--color-muted)]">
          Déclarer un remplacement
        </p>
        <div className="mt-1.5 grid grid-cols-2 gap-2">
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
                className="flex items-center justify-between gap-2 py-1 text-xs hover:underline"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <ActivityTypeIcon type={a.type} size={13} className="shrink-0 text-[var(--color-muted)]" />
                  <span className="truncate">{a.name}</span>
                </span>
                <Badge tone="ok" className="shrink-0">
                  {formatDistance(a.distanceM)}
                </Badge>
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
