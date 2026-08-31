import Link from "next/link";
import type { ReactNode } from "react";
import { HeroStat } from "@/components/ui/hero-stat.tsx";
import { Sparkline } from "@/components/ui/sparkline.tsx";
import { Unavailable } from "@/components/ui/badge.tsx";
import { formatDayLong } from "@/lib/time.ts";
import { diffDays, type Day } from "@/lib/shifts/day.ts";
import type { RecordPoint } from "@/lib/metrics/records.ts";

/**
 * Mur des records. Chaque carte vient d'une progression réelle
 * (`computeRecordProgression`), jamais d'une valeur composée à l'affichage :
 * pas de record sans l'activité qui l'a établi.
 */

export type RecordWallItem = {
  key: string;
  label: string;
  /** Progression chronologique ascendante, le dernier point est le record actuel. */
  progression: RecordPoint[];
  format: (value: number) => { value: ReactNode; unit?: string };
  /** Affiché quand la progression est vide — pourquoi cette donnée manque. */
  unavailableReason: string;
};

export function RecordsWall({ items, today }: { items: RecordWallItem[]; today: Day }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((item) => {
        const current = item.progression[item.progression.length - 1] ?? null;

        if (!current) {
          return (
            <div key={item.key} className="hero-stat-card rounded-[var(--radius-card)] p-4">
              <div className="text-xs text-[var(--color-muted)]">{item.label}</div>
              <div className="mt-2 text-sm">
                <Unavailable reason={item.unavailableReason} />
              </div>
            </div>
          );
        }

        const recent = diffDays(current.day, today) <= 7;
        const { value, unit } = item.format(current.value);
        // Le record actuel + les cinq précédents.
        const history = item.progression.slice(-6).map((p) => p.value);

        return (
          <div key={item.key} className="flex flex-col gap-1.5">
            <Link href={`/activites/${current.activityId}`}>
              <HeroStat label={item.label} value={value} unit={unit} size="md" recent={recent} />
            </Link>
            <div className="flex items-center justify-between px-1">
              <span className="text-[11px] text-[var(--color-faint)]">
                {formatDayLong(current.day)}
              </span>
              {history.length >= 2 ? <Sparkline values={history} /> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
