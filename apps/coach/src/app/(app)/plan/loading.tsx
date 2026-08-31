import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

/** Calque l'état le plus riche (PlanView) : en-tête, périodisation, raisonnement, semaines. */
export default function PlanLoading() {
  return (
    <div className="p-4 md:p-6">
      <header>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-1.5 h-3 w-full max-w-lg" />
      </header>

      <div className="mt-5 max-w-3xl space-y-5">
        <Card elevated>
          <CardHeader
            title={<Skeleton className="h-4 w-40" />}
            hint={<Skeleton className="h-3 w-56" />}
            action={<Skeleton className="h-8 w-28 rounded-lg" />}
          />
        </Card>

        <Card>
          <CardHeader title={<Skeleton className="h-4 w-28" />} hint={<Skeleton className="h-3 w-48" />} />
          <CardBody>
            <Skeleton className="h-3 w-full rounded-[var(--radius-pill)]" />
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-2">
                  <Skeleton className="mt-1 h-2 w-2 shrink-0 rounded-full" />
                  <div className="flex-1 space-y-1">
                    <Skeleton className="h-3 w-20" />
                    <Skeleton className="h-2.5 w-24" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<Skeleton className="h-4 w-28" />} hint={<Skeleton className="h-3 w-56" />} />
          <CardBody className="space-y-2">
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </CardBody>
        </Card>

        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, w) => (
            <Card key={w}>
              <CardHeader title={<Skeleton className="h-4 w-32" />} />
              <div className="divide-y divide-[var(--color-border)]">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-2 px-4 py-2.5">
                    <Skeleton className="h-3 w-16 shrink-0" />
                    <Skeleton className="h-4 w-16 rounded-[var(--radius-pill)]" />
                    <Skeleton className="h-3 w-32" />
                    <Skeleton className="ml-auto h-3 w-20" />
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
