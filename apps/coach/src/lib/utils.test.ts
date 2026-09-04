import { describe, expect, it } from "vitest";
import { formatDistance, formatDistanceOrDuration, formatDuration, formatTimeRange } from "./utils.ts";

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

describe("formatTimeRange (E1 — chrono visé en fourchette)", () => {
  it("référence : affiche « 1 h 03 – 1 h 07 » pour 3780-4020 s", () => {
    expect(formatTimeRange(3780, 4020)).toBe(`${formatDuration(3780)} – ${formatDuration(4020)}`);
    expect(formatTimeRange(3780, 4020)).toBe("1 h 03 – 1 h 07");
  });

  it("affiche une seule valeur quand les deux bornes sont égales (objectif pas encore élargi)", () => {
    expect(formatTimeRange(3840, 3840)).toBe(formatDuration(3840));
    expect(formatTimeRange(3840, 3840)).not.toContain("–");
  });

  it("renvoie null sans borne renseignée, jamais une fourchette inventée", () => {
    expect(formatTimeRange(null, null)).toBeNull();
    expect(formatTimeRange(3780, null)).toBeNull();
    expect(formatTimeRange(null, 4020)).toBeNull();
  });
});
