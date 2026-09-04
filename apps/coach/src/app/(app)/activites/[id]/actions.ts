"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db.ts";

/**
 * Notes libres de l'activité : sauvegarde au blur (le formulaire appelant
 * n'a pas de bouton "enregistrer"), validation Zod ici — jamais côté client
 * seul.
 */
const notesSchema = z.string().max(4000);

export async function saveActivityNote(
  activityId: string,
  notes: string,
): Promise<{ ok: true } | { ok: false; error: string }> {

  const parsed = notesSchema.safeParse(notes);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Note invalide." };

  await prisma.activity.update({
    where: { id: activityId },
    data: { notes: parsed.data.trim() === "" ? null : parsed.data },
  });
  revalidatePath(`/activites/${activityId}`);
  return { ok: true };
}

/**
 * Bascule un tour entre « tour ordinaire » et « lap manuel » mis en avant
 * (CLAUDE.md, page activité §f) — jamais déduit automatiquement, seulement
 * ce que l'utilisateur désigne explicitement.
 */
export async function toggleLapManual(
  lapId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {

  const lap = await prisma.lap.findUnique({ where: { id: lapId }, select: { activityId: true, isManual: true } });
  if (!lap) return { ok: false, error: "Tour introuvable." };

  await prisma.lap.update({ where: { id: lapId }, data: { isManual: !lap.isManual } });
  revalidatePath(`/activites/${lap.activityId}`);
  return { ok: true };
}

/** Variante `<form action>` (sans JS) : même bascule, sans valeur de retour. */
export async function toggleLapManualForm(lapId: string): Promise<void> {
  await toggleLapManual(lapId);
}
