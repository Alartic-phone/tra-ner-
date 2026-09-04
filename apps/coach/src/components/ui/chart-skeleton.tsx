/**
 * Squelette de chargement aux dimensions EXACTES du graphique final —
 * jamais de spinner, jamais de saut de mise en page quand Recharts finit de
 * se charger (import dynamique, ssr:false).
 */
export function ChartSkeleton({ height }: { height: number }) {
  return (
    <div
      aria-hidden
      className="w-full animate-pulse rounded-[var(--radius-card)] bg-[var(--color-surface-2)]"
      style={{ height }}
    />
  );
}
