export default function CalendarLoading() {
  return (
    <div className="animate-pulse p-4 md:p-6">
      <div className="h-6 w-40 rounded bg-[var(--color-surface)]" />
      <div className="mt-4 grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-border)]">
        {Array.from({ length: 35 }, (_, i) => (
          <div key={i} className="min-h-[74px] bg-[var(--color-surface)] md:min-h-[96px]" />
        ))}
      </div>
    </div>
  );
}
