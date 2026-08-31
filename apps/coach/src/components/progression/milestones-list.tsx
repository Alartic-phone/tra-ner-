import { Flag } from "lucide-react";
import { formatDayLong } from "@/lib/time.ts";
import type { Milestone } from "@/lib/metrics/milestones.ts";

/** Jalons détectés automatiquement — aucune saisie manuelle possible ici. */
export function MilestonesList({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) {
    return (
      <p className="px-4 py-3 text-xs text-[var(--color-muted)]">
        Aucun jalon détecté pour l&apos;instant — ils apparaissent au fil des sorties.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-[var(--color-border)]">
      {[...milestones].reverse().map((milestone) => (
        <li key={milestone.key} className="flex items-center gap-3 px-4 py-2.5">
          <Flag size={14} className="shrink-0 text-[var(--color-accent)]" aria-hidden />
          <span className="flex-1 text-sm">{milestone.label}</span>
          <span className="text-xs text-[var(--color-faint)]">{formatDayLong(milestone.day)}</span>
        </li>
      ))}
    </ul>
  );
}
