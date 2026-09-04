import { describe, expect, it } from "vitest";
import { groupByWeek, planMatchStatus } from "./activities-feed.ts";

describe("groupByWeek", () => {
  it("regroupe par semaine ISO (lundi-dimanche)", () => {
    const items = [
      { id: "a", startDay: "2026-08-24" }, // lundi
      { id: "b", startDay: "2026-08-30" }, // dimanche même semaine
      { id: "c", startDay: "2026-08-31" }, // lundi suivant
    ];
    const groups = groupByWeek(items);
    expect(groups).toHaveLength(2);
    expect(groups[0]!.weekStart).toBe("2026-08-31");
    expect(groups[0]!.items.map((i) => i.id)).toEqual(["c"]);
    expect(groups[1]!.weekStart).toBe("2026-08-24");
    expect(groups[1]!.weekEnd).toBe("2026-08-30");
    expect(groups[1]!.items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("les semaines les plus récentes sont en premier", () => {
    const items = [
      { id: "old", startDay: "2026-01-05" },
      { id: "new", startDay: "2026-08-24" },
    ];
    const groups = groupByWeek(items);
    expect(groups[0]!.items[0]!.id).toBe("new");
  });

  it("liste vide -> aucun groupe", () => {
    expect(groupByWeek([])).toEqual([]);
  });
});

describe("planMatchStatus", () => {
  it("in-zone si la majorité du temps mesuré est dans la zone prescrite", () => {
    expect(planMatchStatus(2, [100, 600, 100, 100, 100])).toBe("in-zone");
  });

  it("out-of-zone si la majorité du temps est ailleurs", () => {
    expect(planMatchStatus(2, [600, 100, 100, 100, 100])).toBe("out-of-zone");
  });

  it("null sans zone prescrite", () => {
    expect(planMatchStatus(null, [100, 200])).toBeNull();
    expect(planMatchStatus(undefined, [100, 200])).toBeNull();
  });

  it("null sans mesure exploitable", () => {
    expect(planMatchStatus(2, null)).toBeNull();
    expect(planMatchStatus(2, [0, 0, 0, 0, 0])).toBeNull();
  });
});
