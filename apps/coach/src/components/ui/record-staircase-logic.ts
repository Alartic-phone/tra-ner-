import type { Day } from "../../lib/shifts/day.ts";

/** Logique PURE de <RecordStaircase /> : hauteurs de barres normalisées. */

export type RecordPoint = { day: Day; value: number };

/** Hauteur de chaque barre en % de la plus haute valeur (donc ≤ 100). */
export function barHeightsPct(records: readonly RecordPoint[]): number[] {
  if (records.length === 0) return [];
  const max = Math.max(...records.map((r) => r.value));
  if (max <= 0) return records.map(() => 0);
  return records.map((r) => (r.value / max) * 100);
}
