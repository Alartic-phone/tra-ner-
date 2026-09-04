import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

/** Calque page.tsx : carte Strava (dl + stats), profil, cycle de postes, intégrations. */
export default function SettingsLoading() {
  return (
    <div className="p-4 md:p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-1.5 h-3 w-52" />
        </div>
        <Skeleton className="h-8 w-32 rounded-lg" />
      </header>

      <div className="mt-5 max-w-2xl space-y-5">
        <Card elevated>
          <CardHeader
            title={<Skeleton className="h-4 w-16" />}
            hint={<Skeleton className="h-3 w-full max-w-md" />}
            action={<Skeleton className="h-5 w-20 rounded-[var(--radius-pill)]" />}
          />
          <CardBody>
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i}>
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="mt-1.5 h-3.5 w-20" />
                </div>
              ))}
            </div>
            <Skeleton className="mt-4 h-8 w-32 rounded-lg" />
          </CardBody>
          <div className="grid grid-cols-2 border-t border-[var(--color-border)] sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="px-4 py-3">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="mt-1.5 h-6 w-8" />
              </div>
            ))}
          </div>
        </Card>

        {["Profil", "Cycle de postes"].map((label) => (
          <Card key={label}>
            <CardHeader title={<Skeleton className="h-4 w-16" />} hint={<Skeleton className="h-3 w-48" />} />
            <CardBody>
              <Skeleton className="h-4 w-44" />
            </CardBody>
          </Card>
        ))}

        <Card>
          <CardHeader title={<Skeleton className="h-4 w-40" />} />
          <CardBody className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <Skeleton className="h-3 w-40" />
                  <Skeleton className="h-3 w-56" />
                </div>
                <Skeleton className="h-3 w-24 shrink-0" />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
