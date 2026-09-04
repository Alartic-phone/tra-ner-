export default function ActivityLoading() {
  return (
    <div className="mx-auto max-w-[1100px] animate-pulse">
      <div className="h-[30vh] w-full bg-[var(--color-surface)] sm:h-[45vh]" />
      <div className="space-y-4 p-4 md:space-y-6 md:p-6">
        <div className="flex gap-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-24 w-32 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
          ))}
        </div>
        <div className="h-40 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
        <div className="h-40 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
      </div>
    </div>
  );
}
