import { describe, expect, it } from "vitest";
import { detectMilestones } from "./milestones.ts";

describe("detectMilestones (jalons « premières fois »)", () => {
  it("détecte la première sortie enregistrée", () => {
    const milestones = detectMilestones(
      [{ day: "2026-06-01", distanceM: 5000, type: "Run" }],
      [],
    );
    expect(milestones.find((m) => m.key === "first_activity")?.day).toBe("2026-06-01");
  });

  it("détecte la première sortie de plus de 10 km, pas une de 10 km pile", () => {
    const milestones = detectMilestones(
      [
        { day: "2026-06-01", distanceM: 10_000, type: "Run" },
        { day: "2026-06-08", distanceM: 10_001, type: "Run" },
      ],
      [],
    );
    expect(milestones.find((m) => m.key === "long_run_10k")?.day).toBe("2026-06-08");
  });

  it("ignore les activités qui ne sont pas de la course pour les seuils de distance", () => {
    const milestones = detectMilestones(
      [{ day: "2026-06-01", distanceM: 50_000, type: "Ride" }],
      [],
    );
    expect(milestones.find((m) => m.key === "long_run_10k")).toBeUndefined();
  });

  it("détecte le premier 20 km hebdomadaire, cumulé sur plusieurs sorties de la même semaine", () => {
    // Lundi 2026-06-01 : semaine ISO du 1er au 7 juin. Le jalon porte la date
    // du LUNDI de la semaine (clé de computeWeeklyVolume), pas celle de la
    // sortie qui a fait franchir le seuil.
    const milestones = detectMilestones(
      [
        { day: "2026-06-02", distanceM: 12_000, type: "Run" },
        { day: "2026-06-04", distanceM: 9_000, type: "Run" },
      ],
      [],
    );
    const hit = milestones.find((m) => m.key === "week_20k");
    expect(hit?.day).toBe("2026-06-01");
  });

  it("détecte la première séance planifiée de seuil marquée comme réalisée", () => {
    const milestones = detectMilestones(
      [],
      [
        { day: "2026-06-10", type: "seuil", status: "done" },
        { day: "2026-06-03", type: "seuil", status: "missed" },
      ],
    );
    // La séance manquée ne compte pas : seule celle réalisée déclenche le jalon.
    expect(milestones.find((m) => m.key === "first_threshold")?.day).toBe("2026-06-10");
  });

  it("trie tous les jalons par date croissante", () => {
    const milestones = detectMilestones(
      [
        { day: "2026-06-15", distanceM: 22_000, type: "Run" },
        { day: "2026-06-01", distanceM: 5_000, type: "Run" },
      ],
      [],
    );
    const days = milestones.map((m) => m.day);
    expect(days).toEqual([...days].sort());
  });

  it("ne produit aucun jalon sur un historique vide", () => {
    expect(detectMilestones([], [])).toEqual([]);
  });
});
