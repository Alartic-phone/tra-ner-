import { describe, expect, it } from "vitest";
import { barHeightsPct, type RecordPoint } from "./record-staircase-logic.ts";

// Données de référence de la refonte : progression réelle du record de plus
// longue sortie.
const REFERENCE: RecordPoint[] = [
  { day: "2026-07-24", value: 6.84 },
  { day: "2026-08-14", value: 7.32 },
  { day: "2026-08-20", value: 8.0 },
  { day: "2026-08-25", value: 8.96 },
  { day: "2026-08-29", value: 10.71 },
];

describe("barHeightsPct", () => {
  it("le dernier record (le plus grand) atteint 100 %", () => {
    const heights = barHeightsPct(REFERENCE);
    expect(heights[heights.length - 1]).toBeCloseTo(100, 5);
  });

  it("les hauteurs sont strictement croissantes pour une progression de records", () => {
    const heights = barHeightsPct(REFERENCE);
    for (let i = 1; i < heights.length; i++) {
      expect(heights[i]).toBeGreaterThan(heights[i - 1]!);
    }
  });

  it("la première barre est proportionnelle à sa valeur", () => {
    const heights = barHeightsPct(REFERENCE);
    expect(heights[0]).toBeCloseTo((6.84 / 10.71) * 100, 5);
  });

  it("tableau vide -> tableau vide", () => {
    expect(barHeightsPct([])).toEqual([]);
  });

  it("une seule valeur -> 100 %", () => {
    expect(barHeightsPct([{ day: "2026-08-29", value: 10.71 }])).toEqual([100]);
  });
});
