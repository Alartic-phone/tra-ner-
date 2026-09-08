"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db.ts";
import { getProfileStatus } from "@/lib/metrics/repository.ts";
import { computeHeartRateZones } from "@/lib/metrics/zones.ts";
import { validateRow, type ValidImportRow } from "@/lib/plan-import/parse.ts";

/**
 * Édition manuelle d'une séance unique, hors import CSV — pour l'ajustement
 * ponctuel d'un jour sans repasser par le fichier (l'import reste le
 * mécanisme principal pour la trame, mais un changement de planning se
 * corrige ici directement). Passe par LA MÊME validation qu'une ligne de
 * CSV (`validateRow`) : mêmes bornes, même règle R5 zone/FC — une
 * incohérence saisie à la main est rejetée exactement comme dans un
 * fichier, pas de second jeu de règles plus permissif.
 */
export type SessionFormInput = {
  date: string;
  type: string;
  statut: string;
  distanceKm: string;
  dureeMin: string;
  fcMin: string;
  fcMax: string;
  zone: string;
  objectif: string;
  muscu: string;
  fractionne: string;
  notes: string;
};

export type SessionActionResult = { ok: true } | { ok: false; error: string };

async function validateInput(
  input: SessionFormInput,
): Promise<{ ok: true; row: ValidImportRow } | { ok: false; error: string }> {
  const profileStatus = await getProfileStatus();
  const zones =
    profileStatus.thresholdHr != null
      ? computeHeartRateZones(profileStatus.thresholdHr, profileStatus.profile?.hrMax ?? null)
      : [];

  const cells = [
    input.date,
    "", // "jour" : dérivé de la date, jamais saisi (cf. schema.prisma).
    "", // "poste_F6" : dérivé de lib/shifts/, jamais saisi non plus (cf. parse.ts).
    input.type,
    input.statut,
    input.distanceKm,
    input.dureeMin,
    input.fcMin,
    input.fcMax,
    input.zone,
    input.objectif,
    input.muscu,
    input.fractionne,
    input.notes,
  ];
  const result = validateRow(cells, 1, zones);
  return result.ok ? { ok: true, row: result.row } : { ok: false, error: result.row.reason };
}

function toData(row: ValidImportRow) {
  return {
    day: row.day,
    type: row.type,
    status: row.status,
    distanceM: row.distanceM,
    durationS: row.durationS,
    hrTargetMinBpm: row.hrTargetMinBpm,
    hrTargetMaxBpm: row.hrTargetMaxBpm,
    zoneLabel: row.zoneLabel,
    objective: row.objective,
    muscuDetails: row.muscuDetails,
    fractionneDetails: row.fractionneDetails,
    notes: row.notes,
  };
}

function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * Renumérote les séances d'une journée pour que `orderInDay` reste contigu
 * à partir de 0 — appelée après tout ce qui vide un rang (suppression, ou
 * changement de jour d'une séance) pour ne jamais laisser de trou. Toujours
 * dans la transaction de l'appelant.
 */
async function recompactDay(day: string, tx: Prisma.TransactionClient): Promise<void> {
  const rows = await tx.importedPlanSession.findMany({
    where: { day },
    orderBy: { orderInDay: "asc" },
    select: { id: true, orderInDay: true },
  });
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;
    if (row.orderInDay !== i) {
      await tx.importedPlanSession.update({ where: { id: row.id }, data: { orderInDay: i } });
    }
  }
}

/**
 * Création manuelle : la séance rejoint la fin de sa journée
 * (`orderInDay` = nombre de séances déjà présentes ce jour-là), calculé et
 * écrit dans la même transaction pour éviter toute collision de rang.
 */
export async function createSessionManually(input: SessionFormInput): Promise<SessionActionResult> {
  const validated = await validateInput(input);
  if (!validated.ok) return validated;
  const row = validated.row;

  try {
    await prisma.$transaction(async (tx) => {
      const orderInDay = await tx.importedPlanSession.count({ where: { day: row.day } });
      await tx.importedPlanSession.create({ data: { ...toData(row), orderInDay } });
    });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return { ok: false, error: "Une séance existe déjà à ce rang pour cette date — réessayer." };
    }
    throw e;
  }
  revalidatePath("/plan");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Édition manuelle : si le jour ne change pas, le rang (`orderInDay`) reste
 * intact. S'il change, la séance prend le rang de fin de sa NOUVELLE
 * journée et l'ANCIENNE journée est recompactée pour ne jamais laisser de
 * trou — jamais deux séances de même rang le même jour.
 */
export async function updateSessionManually(
  id: string,
  input: SessionFormInput,
): Promise<SessionActionResult> {
  const validated = await validateInput(input);
  if (!validated.ok) return validated;
  const row = validated.row;

  try {
    await prisma.$transaction(async (tx) => {
      const existing = await tx.importedPlanSession.findUnique({
        where: { id },
        select: { day: true },
      });
      if (!existing) throw new Error("SESSION_NOT_FOUND");

      if (existing.day === row.day) {
        await tx.importedPlanSession.update({ where: { id }, data: toData(row) });
        return;
      }

      const newOrderInDay = await tx.importedPlanSession.count({ where: { day: row.day } });
      await tx.importedPlanSession.update({
        where: { id },
        data: { ...toData(row), orderInDay: newOrderInDay },
      });
      await recompactDay(existing.day, tx);
    });
  } catch (e) {
    if (e instanceof Error && e.message === "SESSION_NOT_FOUND") {
      return { ok: false, error: "Séance introuvable." };
    }
    if (isUniqueConstraintError(e)) {
      return { ok: false, error: "Une séance existe déjà à ce rang pour cette date — réessayer." };
    }
    throw e;
  }
  revalidatePath("/plan");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Suppression manuelle : la journée est recompactée dans la même
 * transaction pour que les rangs restent contigus à partir de 0.
 */
export async function deleteSession(id: string): Promise<SessionActionResult> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.importedPlanSession.findUnique({ where: { id }, select: { day: true } });
    if (!existing) return; // déjà supprimée — idempotent, rien à faire.
    await tx.importedPlanSession.delete({ where: { id } });
    await recompactDay(existing.day, tx);
  });
  revalidatePath("/plan");
  revalidatePath("/");
  return { ok: true };
}

/**
 * Bascule le statut d'une séance entre A_FAIRE et FAIT — l'action la plus
 * fréquente de l'application (cahier des charges §2.3), en un seul appui
 * réversible : un appui de plus annule. Volontairement plus simple que
 * `updateSessionManually` (pas de repassage par `validateRow` : seul le
 * statut change, jamais les autres champs).
 */
export async function toggleSessionStatus(id: string): Promise<SessionActionResult> {
  const session = await prisma.importedPlanSession.findUnique({ where: { id }, select: { status: true } });
  if (!session) return { ok: false, error: "Séance introuvable." };

  await prisma.importedPlanSession.update({
    where: { id },
    data: { status: session.status === "FAIT" ? "A_FAIRE" : "FAIT" },
  });
  revalidatePath("/plan");
  revalidatePath("/");
  return { ok: true };
}
