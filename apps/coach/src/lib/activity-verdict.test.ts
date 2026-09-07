import { describe, expect, it } from "vitest";
import { buildGenericZoneVerdict, buildZoneVerdict, fastestSplitIndex } from "./activity-verdict.ts";

describe("buildGenericZoneVerdict", () => {
  const zoneNames = [
    "récupération",
    "endurance fondamentale",
    "endurance active",
    "seuil",
    "VO2max",
    "anaérobie",
  ];

  it("identifie la zone dominante et son pourcentage réel", () => {
    const text = buildGenericZoneVerdict([200, 2844, 400, 100, 56, 0], zoneNames);
    expect(text).toBe("Majoritairement en zone 2 (endurance fondamentale), 79 % du temps mesuré.");
  });

  it("renvoie null sans cardio mesuré, jamais un verdict inventé", () => {
    expect(buildGenericZoneVerdict(null, zoneNames)).toBeNull();
    expect(buildGenericZoneVerdict([0, 0, 0, 0, 0, 0], zoneNames)).toBeNull();
  });
});

describe("buildZoneVerdict", () => {
  it("calcule le pourcentage réel de temps dans la zone prescrite", () => {
    // Z1..Z5, zone 2 prescrite : 79 % de 3600s total dans Z2.
    const text = buildZoneVerdict(2, [200, 2844, 400, 100, 56]);
    expect(text).toBe("Prescrite en zone 2, réalisée à 79 % en zone 2.");
  });

  it("indique l'absence de cardio quand secondsByZone est null", () => {
    const text = buildZoneVerdict(2, null);
    expect(text).toContain("non mesurable");
  });

  it("indique l'absence de cardio quand le total est nul", () => {
    const text = buildZoneVerdict(2, [0, 0, 0, 0, 0]);
    expect(text).toContain("non mesurable");
  });
});

describe("fastestSplitIndex", () => {
  it("trouve l'index du km le plus rapide", () => {
    const splits = [
      { distanceM: 1000, movingTimeS: 300 },
      { distanceM: 1000, movingTimeS: 280 },
      { distanceM: 1000, movingTimeS: 310 },
    ];
    expect(fastestSplitIndex(splits)).toBe(1);
  });

  it("ignore les splits sans distance ou temps exploitable", () => {
    const splits = [
      { distanceM: 0, movingTimeS: 0 },
      { distanceM: 1000, movingTimeS: 300 },
    ];
    expect(fastestSplitIndex(splits)).toBe(1);
  });

  it("renvoie -1 sans aucun split chronométrable", () => {
    expect(fastestSplitIndex([])).toBe(-1);
    expect(fastestSplitIndex([{ distanceM: 0, movingTimeS: 0 }])).toBe(-1);
  });
});
