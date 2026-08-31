import { Card, CardHeader } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

/** Calque exactement la mise en page de page.tsx pour ne créer aucun saut au chargement. */
export default function DashboardLoading() {
  return (
    <div className="p-4 md:p-6">
      <header>
        <Skeleton className="h-5 w-44" />
        <Skeleton className="mt-1.5 h-3 w-32" />
      </header>

      <div className="mt-4 flex items-center gap-3 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <Skeleton className="h-5 w-5 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-full max-w-md" />
        </div>
      </div>

      <Card elevated className="mt-4">
        <CardHeader title={<Skeleton className="h-4 w-28" />} />
        <div className="px-4 py-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-3 w-56" />
          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-20" />
            ))}
          </div>
          <Skeleton className="mt-3 h-5 w-16 rounded-[var(--radius-pill)]" />
        </div>
      </Card>

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader title={<Skeleton className="h-4 w-28" />} />
          <div className="flex items-center gap-4 p-4">
            <Skeleton className="h-24 w-24 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-3/4" />
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title={<Skeleton className="h-4 w-24" />} />
          <div className="flex items-center gap-4 p-4">
            <Skeleton className="h-24 w-24 shrink-0 rounded-full" />
            <Skeleton className="h-3 w-full flex-1" />
          </div>
        </Card>
        <Card>
          <CardHeader title={<Skeleton className="h-4 w-32" />} />
          <div className="p-4">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="mt-1.5 h-9 w-16" />
            <Skeleton className="mt-1.5 h-3 w-36" />
          </div>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Card elevated>
          <CardHeader title={<Skeleton className="h-4 w-20" />} />
          <div className="p-4">
            <Skeleton className="h-8 w-28" />
            <div className="mt-3 space-y-1.5">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-3 w-40" />
            </div>
          </div>
        </Card>
        <Card elevated>
          <CardHeader title={<Skeleton className="h-4 w-24" />} />
          <div className="flex flex-wrap items-center gap-6 p-4">
            <Skeleton className="h-24 w-24 shrink-0 rounded-full" />
            <div className="flex flex-1 flex-wrap gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-1.5">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-6 w-10" />
                </div>
              ))}
            </div>
          </div>
        </Card>
        <Card className="p-4">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-32" />
          </div>
          <Skeleton className="mt-2 h-9 w-20" />
          <Skeleton className="mt-3 h-2.5 w-full rounded-[var(--radius-pill)]" />
          <Skeleton className="mt-1.5 h-3 w-40" />
        </Card>
      </div>

      <Card elevated className="mt-4">
        <CardHeader title={<Skeleton className="h-4 w-28" />} />
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:grid-cols-4 sm:divide-y-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-1.5 h-9 w-14" />
            </div>
          ))}
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={<Skeleton className="h-4 w-28" />} />
          <div className="divide-y divide-[var(--color-border)]">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3 w-16" />
                  <Skeleton className="h-4 w-8 rounded" />
                </div>
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </div>
        </Card>
        <Card>
          <CardHeader title={<Skeleton className="h-4 w-32" />} />
          <div className="divide-y divide-[var(--color-border)]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2">
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <Skeleton className="h-6 w-9 shrink-0" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="ml-3 h-3 w-20 shrink-0" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
