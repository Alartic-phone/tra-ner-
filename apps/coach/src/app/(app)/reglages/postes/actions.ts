"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db.ts";
import { isAuthenticated } from "@/lib/auth.ts";
import { isValidDay } from "@/lib/shifts/day.ts";
import { cycleLength, validateCycle } from "@/lib/shifts/cycle.ts";
import { shiftBlocksSchema } from "@/lib/shifts/repository.ts";
import { availabilityRulesSchema, setAvailabilityRules } from "@/lib/settings.ts";

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const cycleSchema = z.object({
  anchorDay: z.string().refine(isValidDay, "Jour d'ancrage invalide"),
  blocks: shiftBlocksSchema,
});

/** Enregistre la définition du cycle. La séquence n'est jamais figée en code. */
export async function saveCycle(input: unknown): Promise<ActionResult> {
  if (!(await isAuthenticated())) return { ok: false, error: "Session expirée." };

  const parsed = cycleSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Cycle invalide." };
  }

  const errors = validateCycle(parsed.data);
  if (errors.length > 0) return { ok: false, error: errors.join(" ") };

  const existing = await prisma.shiftPattern.findFirst({ where: { isActive: true } });
  const data = {
    anchorDay: parsed.data.anchorDay,
    blocksJson: JSON.stringify(parsed.data.blocks),
    isActive: true,
  };

  if (existing) {
    await prisma.shiftPattern.update({ where: { id: existing.id }, data });
  } else {
    await prisma.shiftPattern.create({ data });
  }

  revalidatePath("/calendrier");
  revalidatePath("/reglages/postes");
  const len = cycleLength(parsed.data);
  return {
    ok: true,
    message:
      `Cycle enregistré : ${len} jours` +
      (len % 7 === 0
        ? `, soit exactement ${len / 7} semaines — il retombe donc sur les mêmes jours de la semaine.`
        : ". Attention : la longueur n'est pas un multiple de 7, les postes glisseront dans la semaine."),
  };
}

const timingsSchema = z.array(
  z.object({
    code: z.string().min(1).max(2),
    label: z.string().min(1).max(40),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, "Horaire attendu au format HH:mm"),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, "Horaire attendu au format HH:mm"),
    isWork: z.boolean(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }),
);

export async function saveTimings(input: unknown): Promise<ActionResult> {
  if (!(await isAuthenticated())) return { ok: false, error: "Session expirée." };

  const parsed = timingsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Horaires invalides." };
  }

  const codes = parsed.data.map((t) => t.code);
  if (new Set(codes).size !== codes.length) {
    return { ok: false, error: "Deux postes portent le même code." };
  }

  await prisma.$transaction([
    prisma.shiftCode.deleteMany({ where: { code: { notIn: codes } } }),
    ...parsed.data.map((t, i) =>
      prisma.shiftCode.upsert({
        where: { code: t.code },
        create: { ...t, sortOrder: i },
        update: { ...t, sortOrder: i },
      }),
    ),
  ]);

  revalidatePath("/calendrier");
  revalidatePath("/reglages/postes");
  return { ok: true, message: "Horaires enregistrés." };
}

export async function saveRules(input: unknown): Promise<ActionResult> {
  if (!(await isAuthenticated())) return { ok: false, error: "Session expirée." };

  const parsed = availabilityRulesSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Règles invalides." };
  }

  await setAvailabilityRules(parsed.data);
  revalidatePath("/calendrier");
  revalidatePath("/reglages/postes");
  return { ok: true, message: "Contraintes d'entraînement enregistrées." };
}
