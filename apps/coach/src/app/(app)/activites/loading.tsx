import { Card } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

/** Calque page.tsx : filtres en pilules + grille de ActivityCard (p-4, icône 40px, 3 stats, zone bar). */
export default function ActivitiesLoading() {
  return (
    <div className="p-4 md:p-6">
      <header>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-1.5 h-3 w-40" />
      </header>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-[26px] w-20 rounded-[var(--radius-pill)]" />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 9 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              {Array.from({ length: 3 }).map((_, j) => (
                <div key={j} className="space-y-1">
                  <Skeleton className="h-5 w-14" />
                  <Skeleton className="h-2.5 w-10" />
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between">
              <Skeleton className="h-2.5 w-10" />
            </div>
            <Skeleton className="mt-2 h-1.5 w-full rounded-[var(--radius-pill)]" />
          </Card>
        ))}
      </div>
    </div>
  );
}
