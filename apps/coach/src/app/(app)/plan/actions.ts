"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db.ts";
import { isAuthenticated } from "@/lib/auth.ts";
import { generatePlan as runGeneration, regeneratePlan as runRegeneration } from "@/lib/coach/generate.ts";

const goalSchema = z
  .object({
    name: z.string().min(1).max(80),
    day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Jour attendu au format AAAA-MM-JJ"),
    distanceM: z.number().positive().max(300000),
    // Chrono visé en fourchette : les deux bornes ensemble, ou aucune —
    // jamais une borne inventée à partir de l'autre.
    targetTimeMinS: z.union([z.number().int().positive(), z.null()]).optional(),
    targetTimeMaxS: z.union([z.number().int().positive(), z.null()]).optional(),
    floorTimeS: z.union([z.number().int().positive(), z.null()]).optional(),
    priority: z.enum(["A", "B", "C"]).default("A"),
  })
  .refine((v) => (v.targetTimeMinS == null) === (v.targetTimeMaxS == null), {
    message: "Les deux bornes du chrono visé doivent être renseignées ensemble, ou aucune.",
    path: ["targetTimeMaxS"],
  })
  .refine((v) => v.targetTimeMinS == null || v.targetTimeMaxS == null || v.targetTimeMinS <= v.targetTimeMaxS, {
    message: "La borne basse doit être inférieure ou égale à la borne haute.",
    path: ["targetTimeMinS"],
  });

export type GoalResult = { ok: true; goalId: string } | { ok: false; error: string };

export async function createGoal(input: unknown): Promise<GoalResult> {
  if (!(await isAuthenticated())) return { ok: false, error: "Session expirée." };

  const parsed = goalSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue?.path.join(".") ?? "champ"} : ${issue?.message ?? "valeur invalide"}` };
  }

  if (parsed.data.day <= new Date().toISOString().slice(0, 10)) {
    return { ok: false, error: "Le jour de la course doit être dans le futur." };
  }

  const goal = await prisma.goal.create({
    data: {
      name: parsed.data.name,
      day: parsed.data.day,
      distanceM: parsed.data.distanceM,
      targetTimeMinS: parsed.data.targetTimeMinS ?? null,
      targetTimeMaxS: parsed.data.targetTimeMaxS ?? null,
      floorTimeS: parsed.data.floorTimeS ?? null,
      priority: parsed.data.priority,
    },
  });

  revalidatePath("/plan");
  return { ok: true, goalId: goal.id };
}

export type GenerateActionResult = { ok: true } | { ok: false; error: string };

export async function generate(goalId: string): Promise<GenerateActionResult> {
  if (!(await isAuthenticated())) return { ok: false, error: "Session expirée." };
  const result = await runGeneration(goalId);
  revalidatePath("/plan");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function regenerate(goalId: string): Promise<GenerateActionResult> {
  if (!(await isAuthenticated())) return { ok: false, error: "Session expirée." };
  const result = await runRegeneration(goalId);
  revalidatePath("/plan");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
