import { addDays, diffDays } from "../shifts/day.ts";
import type { CoachContext } from "./context.ts";
import type { PlanOutput, WorkoutOutput } from "./schema.ts";

/**
 * « Le modèle propose, le code arbitre. »
 *
 * Revérifie chaque séance proposée contre les contraintes dures calculées
 * ailleurs (disponibilité de postes, zones physiologiques) et contre les
 * garde-fous globaux du cahier des charges (douleur, ratio aigu/chronique).
 * Retourne la liste des violations, lisible telle quelle et destinée à être
 * renvoyée au modèle pour une nouvelle tentative. Liste vide = plan accepté.
 */

const QUALITY_TYPES = new Set(["seuil", "vma", "cotes"]);

function checkWorkout(workout: WorkoutOutput, context: CoachContext): string[] {
  const violations: string[] = [];

  if (workout.day < context.today || workout.day > context.goal.day) {
    violations.push(
      `Séance "${workout.title}" le ${workout.day} : hors de la fenêtre du plan (${context.today} → ${context.goal.day}).`,
    );
    return violations;
  }

  const entry = context.shiftRange.byDay.get(workout.day);
  if (!entry) {
    violations.push(`Séance "${workout.title}" le ${workout.day} : disponibilité inconnue ce jour-là.`);
    return violations;
  }
  const { availability } = entry;

  if (QUALITY_TYPES.has(workout.type) && !availability.allowsQuality) {
    violations.push(
      `Séance "${workout.title}" (${workout.type}) le ${workout.day} : séance de qualité impossible ce jour-là — ${availability.blockers.join(" ") || "créneau incompatible"}.`,
    );
  }

  if (workout.type === "sortie_longue" && !availability.allowsLongRun) {
    violations.push(
      `Séance "${workout.title}" (sortie longue) le ${workout.day} : sortie longue impossible ce jour-là — ${availability.blockers.join(" ") || "créneau incompatible"}.`,
    );
  }

  if (workout.targetDurationS != null) {
    const targetMin = workout.targetDurationS / 60;
    if (targetMin > availability.maxSessionMin + 1) {
      violations.push(
        `Séance "${workout.title}" le ${workout.day} : ${Math.round(targetMin)} min visées, ` +
          `créneau réel de ${availability.maxSessionMin} min seulement.`,
      );
    }
  }

  return violations;
}

/** Somme des durées cibles (en secondes) des séances d'une fenêtre de jours. */
function weekVolumeS(workouts: readonly WorkoutOutput[], from: string, to: string): number {
  return workouts
    .filter((w) => w.day >= from && w.day < to)
    .reduce((sum, w) => sum + (w.targetDurationS ?? 0), 0);
}

export function checkGuardrails(output: PlanOutput, context: CoachContext): string[] {
  const violations: string[] = [];

  for (const workout of output.workouts) {
    violations.push(...checkWorkout(workout, context));
  }

  for (const phase of output.phases) {
    if (phase.startDay > phase.endDay) {
      violations.push(`Phase "${phase.name}" : jour de début postérieur au jour de fin.`);
    }
  }

  // Douleur élevée ou persistante : aucune séance de qualité dans les 7
  // premiers jours, jamais « on pousse quand même ».
  if (context.injuryFlag) {
    const weekOneEnd = addDays(context.today, 7);
    const earlyQuality = output.workouts.filter(
      (w) => w.day >= context.today && w.day < weekOneEnd && QUALITY_TYPES.has(w.type),
    );
    if (earlyQuality.length > 0) {
      violations.push(
        "Douleur signalée récemment (élevée ou persistante) : aucune séance de qualité " +
          "(seuil/VMA/côtes) ne doit être placée dans les 7 prochains jours — privilégier " +
          "la récupération et suggérer une consultation, pas une reprise poussée.",
      );
    }
  }

  // Ratio aigu/chronique en zone d'alerte : la semaine 1 du plan ne doit pas
  // dépasser le volume de la semaine 2 — pas de rampe agressive.
  if (context.fitness?.acwrZone === "alerte") {
    const week1End = addDays(context.today, 7);
    const week2End = addDays(context.today, 14);
    const week1 = weekVolumeS(output.workouts, context.today, week1End);
    const week2 = weekVolumeS(output.workouts, week1End, week2End);
    if (week1 > 0 && week2 > 0 && week1 > week2) {
      violations.push(
        "Ratio charge aiguë/chronique en zone d'alerte (> 1,5) : la première semaine du " +
          "plan doit être allégée d'office, son volume ne doit pas dépasser celui de la " +
          "deuxième semaine.",
      );
    }
  }

  const totalDays = diffDays(context.today, context.goal.day);
  if (totalDays < 1) {
    violations.push("Le jour de l'objectif doit être postérieur à aujourd'hui.");
  }

  return violations;
}
