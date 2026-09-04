import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

/** Calque page.tsx : bandeau CTL/ATL/TSB/ACWR, courbes charge/forme/ratio, zones FC, efforts, vitesse critique, allures. */
export default function AnalyticsLoading() {
  return (
    <div className="p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-1.5 h-3 w-52" />
        </div>
        <Skeleton className="h-8 w-32 rounded-lg" />
      </header>

      <div className="mt-3 flex gap-1.5">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-[26px] w-16 rounded-[var(--radius-pill)]" />
        ))}
      </div>

      <Card elevated className="mt-4">
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:grid-cols-4 sm:divide-y-0">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-1.5 h-9 w-14" />
              <Skeleton className="mt-1.5 h-3 w-20" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title={<Skeleton className="h-4 w-64" />} hint={<Skeleton className="h-3 w-full max-w-md" />} />
        <CardBody>
          <Skeleton className="h-56 w-full" />
        </CardBody>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <CardHeader title={<Skeleton className="h-4 w-16" />} hint={<Skeleton className="h-3 w-full max-w-xs" />} />
            <CardBody>
              <Skeleton className="h-40 w-full" />
            </CardBody>
          </Card>
        ))}
      </div>

      <Card className="mt-4">
        <CardHeader title={<Skeleton className="h-4 w-56" />} hint={<Skeleton className="h-3 w-full max-w-md" />} />
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] sm:grid-cols-3 sm:divide-y-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="p-4">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="mt-1.5 h-6 w-12" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title={<Skeleton className="h-4 w-72" />} hint={<Skeleton className="h-3 w-full max-w-md" />} />
        <CardBody>
          <Skeleton className="h-4 w-full" />
        </CardBody>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title={<Skeleton className="h-4 w-32" />} hint={<Skeleton className="h-3 w-full max-w-sm" />} />
          <CardBody className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-3 w-12" />
              </div>
            ))}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title={<Skeleton className="h-4 w-28" />} hint={<Skeleton className="h-3 w-full max-w-sm" />} />
          <div className="grid grid-cols-2 divide-x divide-[var(--color-border)]">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="p-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="mt-1.5 h-6 w-16" />
                <Skeleton className="mt-1.5 h-3 w-32" />
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
