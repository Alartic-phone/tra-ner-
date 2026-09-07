"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db.ts";

const optionalNumber = (schema: z.ZodNumber) =>
  z.union([schema, z.null()]).optional().transform((v) => v ?? null);

const profileSchema = z.object({
  firstName: z.string().max(60).nullable().optional(),
  birthDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  sex: z.enum(["M", "F"]).nullable().optional(),
  weightKg: optionalNumber(z.number().min(30).max(200)),
  hrMax: optionalNumber(z.number().int().min(120).max(230)),
  hrRest: optionalNumber(z.number().int().min(25).max(100)),
  lactateThresholdHr: optionalNumber(z.number().int().min(100).max(220)),
  vma: optionalNumber(z.number().min(8).max(25)),
  weeklyVolumeKm: optionalNumber(z.number().min(0).max(300)),
  weeklySessionsTarget: optionalNumber(z.number().int().min(0).max(14)),
  injuryHistory: z.string().max(2000).nullable().optional(),
});

export type ProfileResult = { ok: true; message: string } | { ok: false; error: string };

/**
 * Enregistre le profil unique.
 *
 * Modifier la FC max, la FC de repos ou le sexe invalide toutes les charges
 * déjà calculées : le TRIMP de Banister en dépend directement. Le message de
 * retour le dit explicitement plutôt que de laisser des valeurs périmées
 * s'afficher comme si de rien n'était.
 */
export async function saveProfile(input: unknown): Promise<ProfileResult> {

  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: `${issue?.path.join(".") ?? "champ"} : ${issue?.message ?? "valeur invalide"}`,
    };
  }

  const data = parsed.data;

  const existing = await prisma.user.findFirst();
  const affectsLoad =
    existing != null &&
    (existing.hrMax !== data.hrMax ||
      existing.hrRest !== data.hrRest ||
      existing.sex !== data.sex);

  if (existing) {
    await prisma.user.update({ where: { id: existing.id }, data });
  } else {
    await prisma.user.create({ data: { id: "me", ...data } });
  }

  revalidatePath("/reglages/profil");
  revalidatePath("/analyses");
  revalidatePath("/");

  return {
    ok: true,
    message: affectsLoad
      ? "Profil enregistré. Les repères cardiaques ayant changé, toutes les charges déjà calculées sont caduques : lancer « Tout recalculer » depuis la page Analyses."
      : "Profil enregistré.",
  };
}
