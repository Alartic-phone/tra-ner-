/**
 * Squelette de l'accueil, aux dimensions du rendu final — jamais de
 * spinner, jamais de saut de mise en page une fois les données arrivées.
 */
export default function HomeLoading() {
  return (
    <div className="mx-auto max-w-[1100px] animate-pulse space-y-4 p-4 md:space-y-6 md:p-6">
      <div className="h-[196px] rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
      <div className="h-24 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
      <div className="h-11 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <div className="h-40 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
        <div className="h-24 w-40 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
      </div>
      <div className="h-24 rounded-[var(--radius-card)] bg-[var(--color-surface)]" />
    </div>
  );
}
