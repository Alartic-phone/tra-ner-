"use server";

import { revalidatePath } from "next/cache";
import { isAuthenticated } from "@/lib/auth.ts";
import { recomputeMetrics, type RecomputeReport } from "@/lib/metrics/repository.ts";

export type RecomputeResult =
  | { ok: true; report: RecomputeReport }
  | { ok: false; error: string };

/**
 * Recalcule les métriques dérivées. `force` reprend tout depuis le début,
 * ce qui est nécessaire après une modification du profil (FC max, FC de
 * repos, sexe) : toutes les charges déjà calculées deviennent caduques.
 */
export async function recompute(force = false): Promise<RecomputeResult> {
  if (!(await isAuthenticated())) return { ok: false, error: "Session expirée." };

  const report = await recomputeMetrics({ force, budgetMs: 25_000 });
  revalidatePath("/analyses");
  revalidatePath("/");
  revalidatePath("/activites");
  return { ok: true, report };
}
