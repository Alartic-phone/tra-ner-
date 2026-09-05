import { prisma } from "./db.ts";
import { addDays, mondayOf, type Day } from "./shifts/day.ts";
import { today } from "./time.ts";
import { isRun, RUN_TYPES } from "./strava/mapping.ts";
import { fixed } from "./utils.ts";

/** Requêtes propres à /progression : nuage allure×FC, volume hebdomadaire, jalons. */

export type PaceHrPoint = { activityId: string; paceSPerKm: number; avgHr: number; month: string };

/**
 * Nuage allure × FC moyenne, sorties de course d'au moins 30 minutes
 * (spec : « progression aérobie » — trop court, le signal est bruité par
 * l'échauffement).
 */
export async function loadPaceHrCloud(from: Day, to: Day): Promise<PaceHrPoint[]> {
  const rows = await prisma.activity.findMany({
    where: {
      startDay: { gte: from, lte: to },
      type: { in: [...RUN_TYPES] },
      movingTimeS: { gte: 1800 },
      avgHr: { not: null },
      avgSpeedMps: { not: null },
    },
    select: { id: true, startDay: true, avgHr: true, avgSpeedMps: true },
  });

  return rows
    .filter((r) => r.avgSpeedMps! > 0)
    .map((r) => ({
      activityId: r.id,
      paceSPerKm: 1000 / r.avgSpeedMps!,
      avgHr: r.avgHr!,
      month: r.startDay.slice(0, 7),
    }));
}

export type WeeklyVolumePoint = { weekStart: Day; runKm: number; rideKm: number; targetKm: number | null };

/** Volume hebdomadaire course/vélo sur les `weeks` dernières semaines complètes, avec la cible du plan actif si elle en chiffre une. */
export async function loadWeeklyVolumeSeries(weeks: number): Promise<WeeklyVolumePoint[]> {
  const thisWeekStart = mondayOf(today());
  const from = addDays(thisWeekStart, -(weeks - 1) * 7);

  const [activities, plans] = await Promise.all([
    prisma.activity.findMany({
      where: { startDay: { gte: from } },
      select: { startDay: true, distanceM: true, type: true },
    }),
    prisma.trainingPlan.findMany({ where: { status: "active" }, select: { phasesJson: true } }),
  ]);

  const phases = plans.flatMap(
    (p) => JSON.parse(p.phasesJson) as Array<{ startDay: string; endDay: string; weeklyVolumeKm?: number }>,
  );

  const points: WeeklyVolumePoint[] = [];
  for (let i = 0; i < weeks; i++) {
    const weekStart = addDays(from, i * 7);
    const weekEnd = addDays(weekStart, 6);
    const inWeek = activities.filter((a) => a.startDay >= weekStart && a.startDay <= weekEnd);
    const runKm = inWeek.filter((a) => isRun(a.type)).reduce((s, a) => s + a.distanceM, 0) / 1000;
    const rideKm =
      inWeek.filter((a) => /ride|bike|cycl/i.test(a.type)).reduce((s, a) => s + a.distanceM, 0) / 1000;
    const phase = phases.find((ph) => ph.startDay <= weekStart && weekStart <= ph.endDay);
    points.push({ weekStart, runKm, rideKm, targetKm: phase?.weeklyVolumeKm ?? null });
  }
  return points;
}

export type Milestone = { day: Day; label: string };

/**
 * Jalons détectés automatiquement depuis les données réelles — jamais de
 * saisie manuelle (spec /progression). Deux familles, toutes deux dérivées
 * d'une somme ou d'un maximum réel :
 *   - chaque nouveau record de plus longue sortie (déjà la donnée de
 *     <RecordStaircase />) ;
 *   - chaque franchissement d'un cap de kilométrage cumulé en course à pied.
 */
export async function loadMilestones(): Promise<Milestone[]> {
  const runs = await prisma.activity.findMany({
    where: { type: { in: [...RUN_TYPES] } },
    orderBy: { startDay: "asc" },
    select: { startDay: true, distanceM: true },
  });

  const milestones: Milestone[] = [];
  let bestDistance = 0;
  let cumulativeM = 0;
  const thresholdsM = [100_000, 500_000, 1_000_000, 2_000_000, 5_000_000];
  const crossed = new Set<number>();

  for (const run of runs) {
    if (run.distanceM > bestDistance) {
      bestDistance = run.distanceM;
      milestones.push({
        day: run.startDay,
        label: `Record de la plus longue sortie : ${fixed(bestDistance / 1000, 2)} km`,
      });
    }
    cumulativeM += run.distanceM;
    for (const threshold of thresholdsM) {
      if (cumulativeM >= threshold && !crossed.has(threshold)) {
        crossed.add(threshold);
        milestones.push({ day: run.startDay, label: `${threshold / 1000} km cumulés en course à pied` });
      }
    }
  }

  return milestones.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0));
}
