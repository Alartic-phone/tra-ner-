import { describe, expect, it } from "vitest";
import { formatDistance, formatDistanceOrDuration } from "./utils.ts";

describe("formatDistanceOrDuration", () => {
  it("affiche la distance quand elle existe", () => {
    expect(formatDistanceOrDuration(10714, 3459)).toBe(formatDistance(10714));
  });

  it("affiche la durée, jamais « 0 m », pour une activité sans distance (musculation, rameur…)", () => {
    // Cas réel : séances de musculation affichant à tort « 0 m distance ».
    expect(formatDistanceOrDuration(0, 2700)).toBe("45:00");
    expect(formatDistanceOrDuration(0, 2700)).not.toContain("0 m");
  });
});
