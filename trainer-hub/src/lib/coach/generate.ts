import { prisma } from "../db.ts";
import { mondayOf } from "../shifts/day.ts";
import { buildCoachContext } from "./context.ts";
import { CoachGenerationError, generatePlanWithCoach } from "./client.ts";
import type { WorkoutOutput } from "./schema.ts";

/**
 * Orchestre la génération : construit le contexte, appelle le modèle,
 * persiste le plan. C'est ici que « le code arbitre » se traduit en
 * écriture base — la validation elle-même vit dans `guardrails.ts`,
 * appelée par `client.ts` avant que cette fonction ne voie la sortie.
 */

export type GenerateResult = { ok: true; planId: string } | { ok: false; error: string };

/**
 * `context.shiftRange.byDay` est une `Map`, que `JSON.stringify` réduit
 * silencieusement à `{}` — sans erreur, mais en perdant l'information. Elle
 * est de toute façon redondante avec `days`/`availability` (mêmes données,
 * juste indexées) : on l'omet explicitement plutôt que de stocker un
 * artefact trompeur dans `contextJson`.
 */
function serializeContext(context: unknown): string {
  return JSON.stringify(context, (key, value) => (key === "byDay" ? undefined : value));
}

function workoutData(w: WorkoutOutput) {
  return {
    day: w.day,
    type: w.type,
    title: w.title,
    description: w.description ?? null,
    structureJson: w.structure ? JSON.stringify(w.structure) : null,
    targetDurationS: w.targetDurationS ?? null,
    targetDistanceM: w.targetDistanceM ?? null,
    targetPaceMinSPerKm: w.targetPaceMinSPerKm ?? null,
    targetPaceMaxSPerKm: w.targetPaceMaxSPerKm ?? null,
    targetHrZone: w.targetHrZone ?? null,
    isKeySession: w.isKeySession,
    isProvisional: w.isProvisional,
  };
}

export async function generatePlan(goalId: string): Promise<GenerateResult> {
  try {
    const context = await buildCoachContext(goalId);
    const { output, model } = await generatePlanWithCoach(context);

    const plan = await prisma.trainingPlan.create({
      data: {
        goalId,
        name: `Plan vers ${context.goal.name}`,
        startDay: context.today,
        endDay: context.goal.day,
        status: "active",
        phasesJson: JSON.stringify(output.phases),
        model,
        contextJson: serializeContext(context),
        rationale: output.reasoning,
        workouts: { create: output.workouts.map(workoutData) },
        revisions: {
          create: [
            {
              scope: "full",
              triggeredBy: "manual",
              weekStartDay: mondayOf(context.today),
              reasoning: output.reasoning,
              model,
            },
          ],
        },
      },
    });

    return { ok: true, planId: plan.id };
  } catch (error) {
    if (error instanceof CoachGenerationError) return { ok: false, error: error.message };
    console.error(error);
    return { ok: false, error: "La génération du plan a échoué de façon inattendue." };
  }
}

/** Archive le plan actif de l'objectif puis régénère à neuf. */
export async function regeneratePlan(goalId: string): Promise<GenerateResult> {
  await prisma.trainingPlan.updateMany({
    where: { goalId, status: "active" },
    data: { status: "archived" },
  });
  return generatePlan(goalId);
}
