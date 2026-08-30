import { formatClock, formatDistance } from "@/lib/utils.ts";

/**
 * Prochaine course : discrète en bas de page, jamais mise en avant comme le
 * héros. Simple ligne de texte, pas de carte ni de HeroStat — l'objectif se
 * mérite en scrollant jusqu'ici.
 */
export function NextRaceStrip({
  goal,
  daysLeft,
}: {
  goal: { name: string; distanceM: number; targetTimeS: number | null } | null;
  daysLeft: number;
}) {
  if (!goal) return null;

  return (
    <p className="mt-4 text-center text-xs text-[var(--color-faint)]">
      <span className="text-[var(--color-text)]">{goal.name}</span> dans{" "}
      <span className="tabular font-medium text-[var(--color-text)]">{daysLeft}</span>{" "}
      {daysLeft > 1 ? "jours" : "jour"} · {formatDistance(goal.distanceM)}
      {goal.targetTimeS ? ` · objectif ${formatClock(goal.targetTimeS)}` : ""}
    </p>
  );
}
