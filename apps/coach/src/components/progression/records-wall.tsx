import Link from "next/link";
import { Trophy } from "lucide-react";
import type { RecordWallEntry } from "@/lib/metrics/repository.ts";
import { formatClock, formatDistance } from "@/lib/utils.ts";
import { formatDayShort } from "@/lib/time.ts";

/** Le mur des records : un badge par durée de référence, jamais un tableau
 * administratif — c'est motivant, pas comptable. */
export function RecordsWall({ records }: { records: RecordWallEntry[] }) {
  if (records.length === 0) {
    return (
      <p className="text-xs text-[var(--color-muted)]">
        Aucun record établi — il faut d&apos;abord des flux détaillés importés et les
        métriques calculées.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
      {records.map((r) => (
        <Link
          key={r.durationS}
          href={{ pathname: `/activites/${r.activityId}` }}
          className="stagger-item rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-strong)]"
        >
          <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-muted)]">
            <Trophy size={11} className="text-[var(--color-signal)]" aria-hidden />
            {formatClock(r.durationS)}
          </div>
          <div className="hero-numeral mt-1 text-hero-md">{formatDistance(r.distanceM)}</div>
          <div className="mt-0.5 truncate text-[11px] text-[var(--color-faint)]">
            {formatDayShort(r.day)} · {r.activityName}
          </div>
        </Link>
      ))}
    </div>
  );
}
