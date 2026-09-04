"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db.ts";
import { generatePlan as runGeneration, regeneratePlan as runRegeneration } from "@/lib/coach/generate.ts";

const goalSchema = z.object({
  name: z.string().min(1).max(80),
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Jour attendu au format AAAA-MM-JJ"),
  distanceM: z.number().positive().max(300000),
  targetTimeS: z.union([z.number().int().positive(), z.null()]).optional(),
  floorTimeS: z.union([z.number().int().positive(), z.null()]).optional(),
  priority: z.enum(["A", "B", "C"]).default("A"),
});

export type GoalResult = { ok: true; goalId: string } | { ok: false; error: string };

export async function createGoal(input: unknown): Promise<GoalResult> {
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
      targetTimeS: parsed.data.targetTimeS ?? null,
      floorTimeS: parsed.data.floorTimeS ?? null,
      priority: parsed.data.priority,
    },
  });

  revalidatePath("/plan");
  return { ok: true, goalId: goal.id };
}

export type GenerateActionResult = { ok: true } | { ok: false; error: string };

export async function generate(goalId: string): Promise<GenerateActionResult> {
  const result = await runGeneration(goalId);
  revalidatePath("/plan");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function regenerate(goalId: string): Promise<GenerateActionResult> {
  const result = await runRegeneration(goalId);
  revalidatePath("/plan");
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}
