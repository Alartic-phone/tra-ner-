import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

/** Calque page.tsx : trajectoire (anneau), vitesse critique (2 stats + table), calculateur Riegel. */
export default function SimulatorLoading() {
  return (
    <div className="p-4 md:p-6">
      <header>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-1.5 h-3 w-full max-w-lg" />
      </header>

      <div className="mt-5 max-w-3xl space-y-5">
        <Card elevated>
          <CardHeader title={<Skeleton className="h-4 w-44" />} hint={<Skeleton className="h-3 w-48" />} />
          <CardBody>
            <div className="flex flex-wrap items-center gap-5">
              <Skeleton className="h-24 w-24 shrink-0 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-full max-w-xs" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={<Skeleton className="h-4 w-52" />}
            hint={<Skeleton className="h-3 w-full max-w-sm" />}
            action={<Skeleton className="h-5 w-16 rounded-[var(--radius-pill)]" />}
          />
          <div className="grid grid-cols-2 divide-x divide-[var(--color-border)]">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-1.5 h-6 w-16" />
                <Skeleton className="mt-1.5 h-3 w-32" />
              </div>
            ))}
          </div>
          <CardBody className="space-y-2 border-t border-[var(--color-border)]">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<Skeleton className="h-4 w-56" />} />
          <CardBody className="space-y-3">
            <div className="flex gap-3">
              <Skeleton className="h-9 w-28 rounded-lg" />
              <Skeleton className="h-9 w-28 rounded-lg" />
            </div>
            <Skeleton className="h-40 w-full" />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
