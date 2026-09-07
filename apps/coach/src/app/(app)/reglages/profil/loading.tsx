import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { Skeleton } from "@/components/ui/skeleton.tsx";

function FieldSkeleton() {
  return (
    <div>
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-1.5 h-9 w-full rounded-lg" />
    </div>
  );
}

/** Calque profile-form.tsx : quatre cartes de champs (identité, cardio, allure, blessures). */
export default function ProfileLoading() {
  return (
    <div className="mx-auto max-w-[1100px] p-4 md:p-6">
      <header>
        <Skeleton className="h-5 w-16" />
        <Skeleton className="mt-1.5 h-3 w-full max-w-lg" />
      </header>

      <div className="mt-5 max-w-2xl space-y-5">
        <Card>
          <CardHeader title={<Skeleton className="h-4 w-16" />} />
          <CardBody className="grid gap-3 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <FieldSkeleton key={i} />
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<Skeleton className="h-4 w-40" />} hint={<Skeleton className="h-3 w-full max-w-sm" />} />
          <CardBody className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <FieldSkeleton key={i} />
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<Skeleton className="h-4 w-28" />} />
          <CardBody className="grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <FieldSkeleton key={i} />
            ))}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={<Skeleton className="h-4 w-44" />} />
          <CardBody>
            <Skeleton className="h-20 w-full rounded-lg" />
          </CardBody>
        </Card>

        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>
    </div>
  );
}
