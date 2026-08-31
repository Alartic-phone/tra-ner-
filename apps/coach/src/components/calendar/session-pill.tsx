import { Check } from "lucide-react";
import { ActivityTypeIcon, sportColor } from "@/components/activities/activity-icon.tsx";
import { cn, formatDistance } from "@/lib/utils.ts";
import type { CalendarDay } from "./calendar-view.tsx";

/**
 * Une case ne doit jamais montrer deux fois la même séance. Une séance
 * planifiée rapprochée d'une activité réelle (`PlannedWorkout.activityId`)
 * devient une pastille unique « faite » ; seules les activités sans séance
 * associée restent affichées à part, en pastille par sport.
 */
export type SessionItem =
  | {
      kind: "done";
      id: string;
      title: string;
      isKeySession: boolean;
      activity: { id: string; distanceM: number; type: string; startMin: number } | null;
    }
  | {
      kind: "planned";
      id: string;
      title: string;
      isProvisional: boolean;
      isKeySession: boolean;
      status: string;
    }
  | {
      kind: "activity";
      id: string;
      name: string;
      distanceM: number;
      type: string;
      startMin: number;
    };

export function mergeDaySessions(day: CalendarDay): SessionItem[] {
  const activityById = new Map(day.activities.map((a) => [a.id, a]));
  const consumed = new Set<string>();

  const planned: SessionItem[] = day.planned.map((p) => {
    const activity = p.activityId ? (activityById.get(p.activityId) ?? null) : null;
    if (activity) consumed.add(activity.id);
    if (p.status === "done" || activity) {
      return {
        kind: "done",
        id: p.id,
        title: p.title,
        isKeySession: p.isKeySession,
        activity: activity
          ? {
              id: activity.id,
              distanceM: activity.distanceM,
              type: activity.type,
              startMin: activity.startMin,
            }
          : null,
      };
    }
    return {
      kind: "planned",
      id: p.id,
      title: p.title,
      isProvisional: p.isProvisional,
      isKeySession: p.isKeySession,
      status: p.status,
    };
  });

  const looseActivities: SessionItem[] = day.activities
    .filter((a) => !consumed.has(a.id))
    .map((a) => ({
      kind: "activity",
      id: a.id,
      name: a.name,
      distanceM: a.distanceM,
      type: a.type,
      startMin: a.startMin,
    }));

  return [...planned, ...looseActivities];
}

export function SessionPill({ item, className }: { item: SessionItem; className?: string }) {
  if (item.kind === "done") {
    return (
      <div
        className={cn(
          "flex items-center gap-1 truncate rounded-[var(--radius-pill)] bg-[var(--color-ok)]/15 px-1.5 text-[10px] leading-4 text-[var(--color-ok)]",
          className,
        )}
        title={`${item.title} — réalisée`}
      >
        <Check size={9} className="shrink-0" aria-hidden />
        <span className="truncate">
          {item.isKeySession ? "★ " : ""}
          {item.title}
        </span>
        {item.activity ? (
          <span className="tabular shrink-0 opacity-80">{formatDistance(item.activity.distanceM)}</span>
        ) : null}
      </div>
    );
  }

  if (item.kind === "planned") {
    return (
      <div
        className={cn(
          "truncate rounded-[var(--radius-pill)] border border-dashed px-1.5 text-[10px] leading-4",
          item.status === "missed"
            ? "border-[var(--color-danger)]/40 text-[var(--color-danger)] line-through opacity-70"
            : "border-[var(--color-border-strong)] text-[var(--color-muted)]",
          className,
        )}
        title={
          item.isProvisional
            ? `${item.title} — séance provisoire (jour de repos théorique)`
            : item.title
        }
      >
        {item.isKeySession ? "★ " : ""}
        {item.title}
      </div>
    );
  }

  const color = sportColor(item.type);
  return (
    <div
      className={cn(
        "flex items-center gap-1 truncate rounded-[var(--radius-pill)] px-1.5 text-[10px] leading-4",
        className,
      )}
      style={{ backgroundColor: `color-mix(in oklab, ${color} 22%, transparent)`, color }}
      title={item.name}
    >
      <ActivityTypeIcon type={item.type} size={9} className="shrink-0" />
      <span className="tabular truncate">{formatDistance(item.distanceM)}</span>
    </div>
  );
}
