export default function ProgressionLoading() {
  return (
    <div className="mx-auto max-w-[1100px] animate-pulse space-y-6 p-4 md:p-6">
      <div className="h-[120px] rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-20 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
        ))}
      </div>
      <div className="h-40 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
      <div className="h-64 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
    </div>
  );
}
