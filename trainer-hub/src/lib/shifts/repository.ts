import { z } from "zod";
import { prisma } from "../db.ts";
import {
  computeAvailability,
  timingsToMap,
  type AvailabilityRules,
  type DayAvailability,
} from "./availability.ts";
import {
  computeReplacementStats,
  resolveRange,
  toExceptionMap,
  validateCycle,
  type ExceptionMap,
  type ReplacementStats,
} from "./cycle.ts";
import { DEFAULT_SHIFT_CYCLE, DEFAULT_SHIFT_TIMINGS } from "./defaults.ts";
import type { Day } from "./day.ts";
import type { ResolvedDay, ShiftCycle, ShiftTiming } from "./types.ts";

/**
 * Pont entre la base et le moteur de postes. Le moteur reste pur : c'est ici
 * qu'on lit la définition stockée, jamais l'inverse.
 */

export const shiftBlockSchema = z.object({
  sequence: z
    .string()
    .min(1, "La séquence ne peut pas être vide")
    .regex(/^[A-Z]+$/, "La séquence n'accepte que des codes en majuscules"),
  restDays: z.number().int().min(0).max(365),
});

export const shiftBlocksSchema = z.array(shiftBlockSchema).min(1);

export async function getActiveCycle(): Promise<ShiftCycle> {
  const pattern = await prisma.shiftPattern.findFirst({
    where: { isActive: true },
    orderBy: { createdAt: "desc" },
  });
  if (!pattern) return DEFAULT_SHIFT_CYCLE;

  const parsed = shiftBlocksSchema.safeParse(JSON.parse(pattern.blocksJson));
  if (!parsed.success) return DEFAULT_SHIFT_CYCLE;

  const cycle: ShiftCycle = { anchorDay: pattern.anchorDay, blocks: parsed.data };
  return validateCycle(cycle).length === 0 ? cycle : DEFAULT_SHIFT_CYCLE;
}

export async function getTimings(): Promise<ShiftTiming[]> {
  const rows = await prisma.shiftCode.findMany({ orderBy: { sortOrder: "asc" } });
  if (rows.length === 0) return DEFAULT_SHIFT_TIMINGS;
  return rows.map((r) => ({
    code: r.code,
    label: r.label,
    startTime: r.startTime,
    endTime: r.endTime,
    isWork: r.isWork,
    color: r.color,
  }));
}

export async function getExceptions(from: Day, to: Day): Promise<ExceptionMap> {
  const rows = await prisma.shiftException.findMany({
    where: { day: { gte: from, lte: to } },
  });
  return toExceptionMap(rows.map((r) => ({ day: r.day, code: r.code })));
}

export type ShiftRange = {
  cycle: ShiftCycle;
  timings: ShiftTiming[];
  days: ResolvedDay[];
  availability: DayAvailability[];
  /** Indexé par jour, pour un accès direct depuis les composants. */
  byDay: Map<Day, { resolved: ResolvedDay; availability: DayAvailability }>;
};

/**
 * Charge et résout une plage complète : cycle théorique + exceptions +
 * créneaux disponibles.
 *
 * La plage interne est élargie d'un jour de chaque côté, car la disponibilité
 * d'une journée dépend des postes de la veille et du lendemain (poste de nuit
 * qui déborde, veille d'entrée en nuit).
 */
export async function loadShiftRange(
  from: Day,
  to: Day,
  rules: AvailabilityRules,
): Promise<ShiftRange> {
  const [cycle, timings] = await Promise.all([getActiveCycle(), getTimings()]);

  const padFrom = shiftDay(from, -1);
  const padTo = shiftDay(to, 1);
  const exceptions = await getExceptions(padFrom, padTo);

  const padded = resolveRange(cycle, padFrom, padTo, exceptions);
  const paddedAvailability = computeAvailability(padded, timingsToMap(timings), rules);

  const days = padded.slice(1, -1);
  const availability = paddedAvailability.slice(1, -1);

  const byDay = new Map<Day, { resolved: ResolvedDay; availability: DayAvailability }>();
  days.forEach((resolved, i) => {
    byDay.set(resolved.day, { resolved, availability: availability[i]! });
  });

  return { cycle, timings, days, availability, byDay };
}

export async function loadReplacementStats(
  from: Day,
  to: Day,
): Promise<ReplacementStats> {
  const cycle = await getActiveCycle();
  const exceptions = await getExceptions(from, to);
  return computeReplacementStats(cycle, from, to, exceptions);
}

// Import local pour éviter une dépendance circulaire de barrel.
function shiftDay(day: Day, n: number): Day {
  const ms = Date.parse(`${day}T00:00:00.000Z`) + n * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Écrit ou annule une exception. Une exception qui rétablit exactement le
 * cycle théorique est supprimée plutôt que stockée : le calendrier ne doit
 * garder que de vrais écarts.
 */
export async function setException(
  day: Day,
  code: string | null,
  note?: string | null,
): Promise<{ removed: boolean }> {
  const cycle = await getActiveCycle();
  const exceptions = await getExceptions(day, day);
  const resolved = resolveRange(cycle, day, day, exceptions)[0]!;

  if (resolved.theoreticalCode === code) {
    await prisma.shiftException.deleteMany({ where: { day } });
    return { removed: true };
  }

  const isReplacement = resolved.theoreticalCode === null && code !== null;
  await prisma.shiftException.upsert({
    where: { day },
    create: { day, code, note: note ?? null, isReplacement },
    update: { code, note: note ?? null, isReplacement },
  });
  return { removed: false };
}

export async function clearException(day: Day): Promise<void> {
  await prisma.shiftException.deleteMany({ where: { day } });
}
