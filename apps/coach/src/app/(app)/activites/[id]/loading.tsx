import { ArrowLeft } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

/** Calque page.tsx : hero 3 stats, tracé, flux détaillés, tours, analyse. */
export default function ActivityLoading() {
  return (
    <div className="p-4 md:p-6">
      <span className="inline-flex items-center gap-1 text-xs text-[var(--color-faint)]">
        <ArrowLeft size={13} aria-hidden /> Activités
      </span>

      <header className="mt-2">
        <Skeleton className="h-5 w-56" />
        <Skeleton className="mt-1.5 h-3 w-72" />
      </header>

      <Card elevated className="mt-4">
        <CardBody className="grid grid-cols-3 gap-4 sm:gap-6">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i}>
              <Skeleton className="h-2.5 w-16" />
              <Skeleton className="mt-1.5 h-9 w-20 sm:h-12 sm:w-28" />
            </div>
          ))}
        </CardBody>
        <div className="grid grid-cols-2 divide-x divide-y divide-[var(--color-border)] border-t border-[var(--color-border)] sm:grid-cols-3 sm:divide-y-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="mt-1.5 h-6 w-12" />
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-4">
        <CardHeader title={<Skeleton className="h-4 w-14" />} hint={<Skeleton className="h-3 w-40" />} />
        <CardBody className="flex justify-center">
          <Skeleton className="h-[320px] w-full max-w-md" />
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title={<Skeleton className="h-4 w-28" />} hint={<Skeleton className="h-3 w-48" />} />
        <CardBody>
          <Skeleton className="h-48 w-full" />
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader
          title={<Skeleton className="h-4 w-12" />}
          hint={<Skeleton className="h-3 w-56" />}
          action={<Skeleton className="h-5 w-14 rounded-[var(--radius-pill)]" />}
        />
        <CardBody className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-4 w-full" />
          ))}
        </CardBody>
      </Card>

      <Card className="mt-4">
        <CardHeader title={<Skeleton className="h-4 w-16" />} hint={<Skeleton className="h-3 w-52" />} />
        <div className="grid grid-cols-1 divide-y divide-[var(--color-border)] sm:grid-cols-2 sm:divide-x sm:divide-y-0">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="px-4 py-3">
              <Skeleton className="h-3 w-40" />
              <Skeleton className="mt-1.5 h-6 w-16" />
              <Skeleton className="mt-1.5 h-3 w-52" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
