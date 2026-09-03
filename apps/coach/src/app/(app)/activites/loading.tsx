export default function ActivitiesLoading() {
  return (
    <div className="mx-auto max-w-[1100px] animate-pulse p-4 md:p-6">
      <div className="h-6 w-40 rounded bg-[var(--color-surface)]" />
      <div className="mt-3 h-9 w-full max-w-md rounded-lg bg-[var(--color-surface)]" />
      <div className="mt-4 space-y-3 rounded-[var(--radius-card)] border border-[var(--color-border)] p-2">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex items-center gap-4 p-2">
            <div className="h-16 w-16 shrink-0 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
            <div className="flex-1 space-y-2">
              <div className="h-4 w-1/2 rounded bg-[var(--color-surface)]" />
              <div className="h-3 w-1/3 rounded bg-[var(--color-surface)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
