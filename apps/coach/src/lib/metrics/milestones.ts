import { compareDays, type Day } from "../shifts/day.ts";
import { isRun } from "../strava/mapping.ts";
import { computeWeeklyVolume } from "./volume.ts";

/**
 * Jalons détectés automatiquement depuis les données — jamais saisis à la
 * main. Un jalon n'apparaît que s'il est réellement atteint : pas de liste
 * figée affichée à moitié grisée.
 */

export type Milestone = { key: string; label: string; day: Day };

const LONG_RUN_THRESHOLDS = [
  { key: "long_run_10k", label: "Première sortie de plus de 10 km", meters: 10_000 },
  { key: "long_run_half", label: "Première sortie de plus de 21 km", meters: 21_097 },
] as const;

const WEEKLY_VOLUME_THRESHOLDS = [
  { key: "week_20k", label: "Premier 20 km sur une semaine", meters: 20_000 },
  { key: "week_40k", label: "Premier 40 km sur une semaine", meters: 40_000 },
] as const;

/** Type de `PlannedWorkout` -> jalon associé à sa première réalisation. */
const WORKOUT_MILESTONES: ReadonlyArray<{ type: string; key: string; label: string }> = [
  { type: "seuil", key: "first_threshold", label: "Premier test de seuil" },
  { type: "vma", key: "first_vma", label: "Première séance de VMA" },
];

export function detectMilestones(
  activities: ReadonlyArray<{ day: Day; distanceM: number; type: string }>,
  plannedWorkouts: ReadonlyArray<{ day: Day; type: string; status: string }>,
): Milestone[] {
  const milestones: Milestone[] = [];
  const sortedActivities = [...activities].sort((a, b) => compareDays(a.day, b.day));

  if (sortedActivities.length > 0) {
    milestones.push({
      key: "first_activity",
      label: "Première sortie enregistrée",
      day: sortedActivities[0]!.day,
    });
  }

  const runs = sortedActivities.filter((a) => isRun(a.type));

  for (const threshold of LONG_RUN_THRESHOLDS) {
    const hit = runs.find((r) => r.distanceM > threshold.meters);
    if (hit) milestones.push({ key: threshold.key, label: threshold.label, day: hit.day });
  }

  const weeklyRunVolume = [...computeWeeklyVolume(runs).entries()].sort(([a], [b]) =>
    compareDays(a, b),
  );
  for (const threshold of WEEKLY_VOLUME_THRESHOLDS) {
    const hit = weeklyRunVolume.find(([, volume]) => volume.runM >= threshold.meters);
    if (hit) milestones.push({ key: threshold.key, label: threshold.label, day: hit[0] });
  }

  const doneWorkouts = [...plannedWorkouts]
    .filter((w) => w.status === "done")
    .sort((a, b) => compareDays(a.day, b.day));
  for (const workoutMilestone of WORKOUT_MILESTONES) {
    const hit = doneWorkouts.find((w) => w.type === workoutMilestone.type);
    if (hit) {
      milestones.push({ key: workoutMilestone.key, label: workoutMilestone.label, day: hit.day });
    }
  }

  return milestones.sort((a, b) => compareDays(a.day, b.day));
}
