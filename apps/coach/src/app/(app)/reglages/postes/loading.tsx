import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

function FieldSkeleton({ className }: { className?: string }) {
  return (
    <div className={className}>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="mt-1.5 h-9 w-full rounded-lg" />
    </div>
  );
}

/** Calque shift-settings-form.tsx : séquence du cycle, horaires par poste, règles de disponibilité. */
export default function ShiftSettingsLoading() {
  return (
    <div className="p-4 md:p-6">
      <header>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-1.5 h-3 w-full max-w-lg" />
      </header>

      <div className="mt-5 max-w-2xl space-y-5">
        <Card>
          <CardHeader title={<Skeleton className="h-4 w-52" />} hint={<Skeleton className="h-3 w-full max-w-sm" />} />
          <CardBody className="space-y-3">
            <FieldSkeleton className="max-w-xs" />
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="grid grid-cols-2 gap-3">
                <FieldSkeleton />
                <FieldSkeleton />
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<Skeleton className="h-4 w-40" />} hint={<Skeleton className="h-3 w-full max-w-sm" />} />
          <CardBody className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="grid grid-cols-5 gap-3">
                {Array.from({ length: 5 }).map((_, j) => (
                  <FieldSkeleton key={j} />
                ))}
              </div>
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<Skeleton className="h-4 w-56" />} />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <FieldSkeleton key={i} />
            ))}
          </CardBody>
        </Card>

        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
    </div>
  );
}
