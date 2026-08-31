import { Card, CardHeader } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

const WEEKDAYS = ["L", "M", "M", "J", "V", "S", "D"];

/** Calque month-grid.tsx (7 colonnes, cellules min-h-[74px]/md:96px) et la carte de stats en dessous. */
export default function CalendarLoading() {
  return (
    <div className="p-4 md:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Skeleton className="h-5 w-36" />
          <Skeleton className="mt-1.5 h-3 w-56" />
        </div>
        <div className="flex items-center gap-1">
          <Skeleton className="h-9 w-9 rounded-lg" />
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-9 rounded-lg" />
        </div>
      </header>

      <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-border)]">
        {WEEKDAYS.map((label, i) => (
          <div
            key={i}
            className="bg-[var(--color-surface)] py-1.5 text-center text-[11px] text-[var(--color-muted)]"
          >
            {label}
          </div>
        ))}
        {Array.from({ length: 42 }).map((_, i) => (
          <div key={i} className="min-h-[74px] bg-[var(--color-surface)] p-1 pl-2 md:min-h-[96px]">
            <Skeleton className="h-3 w-4" />
          </div>
        ))}
      </div>

      <Card className="mt-6">
        <CardHeader title={<Skeleton className="h-4 w-32" />} />
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:grid-cols-4 sm:divide-y-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-1.5 h-6 w-10" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
