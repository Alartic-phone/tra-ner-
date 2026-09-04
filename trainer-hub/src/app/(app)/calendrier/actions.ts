"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eachDay, isValidDay } from "@/lib/shifts/day.ts";
import { clearException, setException } from "@/lib/shifts/repository.ts";

const daySchema = z.string().refine(isValidDay, "Jour invalide");

const payloadSchema = z.object({
  from: daySchema,
  to: daySchema,
  /** `null` = repos. `undefined` = retour au cycle théorique. */
  code: z.string().min(1).max(2).nullable().optional(),
  reset: z.boolean().default(false),
});

export type ShiftUpdateResult = { ok: true; changed: number } | { ok: false; error: string };

/**
 * Applique une exception à un jour ou à une plage.
 *
 * Une seule action couvre les trois cas du cahier des charges : repos ->
 * poste (remplacement), poste -> repos, poste -> autre poste. Aucune
 * récurrence n'est jamais créée.
 */
export async function updateShifts(input: unknown): Promise<ShiftUpdateResult> {
  const parsed = payloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Requête invalide." };
  }
  const { from, to, code, reset } = parsed.data;

  const days = from <= to ? eachDay(from, to) : eachDay(to, from);
  if (days.length === 0) return { ok: false, error: "Plage vide." };
  if (days.length > 366) return { ok: false, error: "Plage trop longue (366 jours max)." };

  for (const day of days) {
    if (reset) {
      await clearException(day);
    } else {
      await setException(day, code ?? null);
    }
  }

  revalidatePath("/calendrier");
  revalidatePath("/");
  return { ok: true, changed: days.length };
}
