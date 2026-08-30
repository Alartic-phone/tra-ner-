import { z } from "zod/v4";

/**
 * Schéma de la sortie du modèle lors de la génération d'un plan.
 *
 * En `zod/v4` (et non le `zod` v3 utilisé ailleurs dans l'application) car
 * `zodOutputFormat` du SDK Anthropic exige un schéma v4 — les deux
 * coexistent dans le même paquet `zod` à partir de la 3.25, aucun conflit
 * avec le reste du code.
 *
 * Les types de séance et de phase reprennent mot pour mot les valeurs
 * documentées en commentaire dans `prisma/schema.prisma`
 * (`PlannedWorkout.type`, `TrainingPlan.phasesJson`) : ce ne sont pas des
 * séquences arbitraires, c'est le contrat déjà fixé par le schéma de base.
 */

const dayRegex = /^\d{4}-\d{2}-\d{2}$/;

export const workoutTypeSchema = z.enum([
  "endurance",
  "seuil",
  "vma",
  "cotes",
  "sortie_longue",
  "recuperation",
  "repos",
]);

export type WorkoutType = z.infer<typeof workoutTypeSchema>;

export const phaseNameSchema = z.enum(["base", "developpement", "specifique", "affutage"]);

export const structureStepSchema = z
  .object({
    repeat: z.number().int().min(1).max(30).optional(),
    workDurationS: z.number().int().positive().optional(),
    workDistanceM: z.number().positive().optional(),
    paceMinSPerKm: z.number().positive().optional(),
    paceMaxSPerKm: z.number().positive().optional(),
    hrZone: z.number().int().min(1).max(5).optional(),
    recoveryDurationS: z.number().int().nonnegative().optional(),
  })
  .strict();

export const workoutSchema = z
  .object({
    day: z.string().regex(dayRegex, "Jour attendu au format AAAA-MM-JJ"),
    type: workoutTypeSchema,
    title: z.string().min(1).max(80),
    description: z.string().max(600).optional(),
    structure: z.array(structureStepSchema).max(20).optional(),
    targetDurationS: z.number().int().positive().optional(),
    targetDistanceM: z.number().positive().optional(),
    targetPaceMinSPerKm: z.number().positive().optional(),
    targetPaceMaxSPerKm: z.number().positive().optional(),
    targetHrZone: z.number().int().min(1).max(5).optional(),
    isKeySession: z.boolean().default(false),
    isProvisional: z.boolean().default(false),
  })
  .strict();

export type WorkoutOutput = z.infer<typeof workoutSchema>;

export const phaseSchema = z
  .object({
    name: phaseNameSchema,
    startDay: z.string().regex(dayRegex),
    endDay: z.string().regex(dayRegex),
    focus: z.string().min(1).max(300),
    weeklyVolumeKm: z.number().positive().optional(),
  })
  .strict();

export type PhaseOutput = z.infer<typeof phaseSchema>;

export const planOutputSchema = z
  .object({
    phases: z.array(phaseSchema).min(1).max(8),
    workouts: z.array(workoutSchema).min(1).max(200),
    /** Raisonnement conservé et affiché tel quel : le plan doit pouvoir être compris. */
    reasoning: z.string().min(1).max(4000),
    /** Réserves que le modèle souhaite signaler (ex. profil physiologique incomplet). */
    warnings: z.array(z.string().max(300)).max(20).default([]),
  })
  .strict();

export type PlanOutput = z.infer<typeof planOutputSchema>;
