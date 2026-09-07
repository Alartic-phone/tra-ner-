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

export async function createSessionManually(input: SessionFormInput): Promise<SessionActionResult> {
  const validated = await validateInput(input);
  if (!validated.ok) return validated;

  try {
    await prisma.importedPlanSession.create({ data: toData(validated.row) });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return { ok: false, error: "Une séance existe déjà à cette date avec cet objectif." };
    }
    throw e;
  }
  revalidatePath("/plan");
  revalidatePath("/");
  return { ok: true };
}

export async function updateSessionManually(
  id: string,
  input: SessionFormInput,
): Promise<SessionActionResult> {
  const validated = await validateInput(input);
  if (!validated.ok) return validated;

  try {
    await prisma.importedPlanSession.update({ where: { id }, data: toData(validated.row) });
  } catch (e) {
    if (isUniqueConstraintError(e)) {
      return { ok: false, error: "Une autre séance existe déjà à cette date avec cet objectif." };
    }
    throw e;
  }
  revalidatePath("/plan");
  revalidatePath("/");
  return { ok: true };
}

export async function deleteSession(id: string): Promise<SessionActionResult> {
  await prisma.importedPlanSession.delete({ where: { id } });
  revalidatePath("/plan");
  revalidatePath("/");
  return { ok: true };
}
