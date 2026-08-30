"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isAuthenticated } from "@/lib/auth.ts";
import { prisma } from "@/lib/db.ts";

const payloadSchema = z.object({
  activityId: z.string().min(1),
  notes: z.string().max(4000).trim(),
});

export type UpdateNotesResult = { ok: true } | { ok: false; error: string };

/** Sauvegarde du ressenti libre d'une activité, au blur du champ. */
export async function updateActivityNotes(input: unknown): Promise<UpdateNotesResult> {
  if (!(await isAuthenticated())) return { ok: false, error: "Session expirée." };

  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Requête invalide." };
  }
  const { activityId, notes } = parsed.data;

  await prisma.activity.update({
    where: { id: activityId },
    data: { notes: notes === "" ? null : notes },
  });

  revalidatePath(`/activites/${activityId}`);
  return { ok: true };
}
