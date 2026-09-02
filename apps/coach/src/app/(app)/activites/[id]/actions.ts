"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db.ts";
import { isAuthenticated } from "@/lib/auth.ts";

const notesSchema = z.object({
  activityId: z.string().min(1),
  notes: z.string().max(4000),
});

export type SaveNotesResult = { ok: true } | { ok: false; error: string };

/** Notes libres sur une activité — jamais générées, uniquement ce que l'utilisateur écrit. */
export async function saveActivityNotes(input: unknown): Promise<SaveNotesResult> {
  if (!(await isAuthenticated())) return { ok: false, error: "Session expirée." };

  const parsed = notesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Note invalide (4000 caractères maximum)." };

  await prisma.activity.update({
    where: { id: parsed.data.activityId },
    data: { notes: parsed.data.notes.trim().length > 0 ? parsed.data.notes : null },
  });

  revalidatePath(`/activites/${parsed.data.activityId}`);
  return { ok: true };
}
