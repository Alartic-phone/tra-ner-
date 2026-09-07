"use server";

import { revalidatePath } from "next/cache";
import { getProfileStatus } from "@/lib/metrics/repository.ts";
import { computeHeartRateZones } from "@/lib/metrics/zones.ts";
import { parsePlanImportCsv, type RejectedImportRow, type ValidImportRow } from "@/lib/plan-import/parse.ts";
import { classifyImportRows, writeImportedSessions } from "@/lib/plan-import/repository.ts";

export type PlanImportPreviewRow = ValidImportRow & { action: "create" | "update" };

export type PlanImportPreview =
  | { ok: false; fileError: string }
  | {
      ok: true;
      encoding: "utf-8" | "windows-1252";
      valid: PlanImportPreviewRow[];
      rejected: RejectedImportRow[];
    };

async function readCsvBuffer(formData: FormData): Promise<Buffer | { error: string }> {
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { error: "Aucun fichier reçu." };
  }
  if (file.size === 0) {
    return { error: "Le fichier est vide." };
  }
  return Buffer.from(await file.arrayBuffer());
}

async function currentHrZones() {
  const profileStatus = await getProfileStatus();
  return profileStatus.thresholdHr != null
    ? computeHeartRateZones(profileStatus.thresholdHr, profileStatus.profile?.hrMax ?? null)
    : [];
}

/**
 * Étape 1/2 : analyse uniquement, RIEN n'est écrit. Le fichier est
 * entièrement revalidé côté serveur (jamais fait confiance à un aperçu
 * calculé côté client) et classé création/mise à jour par rapport à l'état
 * actuel de la base.
 */
export async function analyzePlanImport(formData: FormData): Promise<PlanImportPreview> {
  const buffer = await readCsvBuffer(formData);
  if ("error" in buffer) return { ok: false, fileError: buffer.error };

  const zones = await currentHrZones();
  const result = parsePlanImportCsv(buffer, zones);
  if (!result.ok) return result;

  const actions = await classifyImportRows(result.valid);
  const valid: PlanImportPreviewRow[] = result.valid.map((row) => ({
    ...row,
    action: actions.get(row.line) ?? "create",
  }));

  return { ok: true, encoding: result.encoding, valid, rejected: result.rejected };
}

export type PlanImportConfirmResult =
  | { ok: true; created: number; updated: number }
  | { ok: false; error: string };

/**
 * Étape 2/2 : reparse et revalide le MÊME fichier (renvoyé par le client,
 * pas un état gardé côté serveur entre les deux appels) avant d'écrire.
 * Tout ou rien : la moindre ligne rejetée bloque l'écriture entière, une
 * transaction unique porte les upserts (jamais de deleteMany).
 */
export async function confirmPlanImport(formData: FormData): Promise<PlanImportConfirmResult> {
  const buffer = await readCsvBuffer(formData);
  if ("error" in buffer) return { ok: false, error: buffer.error };

  const zones = await currentHrZones();
  const result = parsePlanImportCsv(buffer, zones);
  if (!result.ok) return { ok: false, error: result.fileError };

  if (result.rejected.length > 0) {
    return {
      ok: false,
      error: `${result.rejected.length} ligne(s) invalide(s) — aucune écriture n'a été faite. Corriger le fichier et réimporter.`,
    };
  }
  if (result.valid.length === 0) {
    return { ok: false, error: "Aucune ligne à importer." };
  }

  const { created, updated } = await writeImportedSessions(result.valid);
  revalidatePath("/plan");
  return { ok: true, created, updated };
}
