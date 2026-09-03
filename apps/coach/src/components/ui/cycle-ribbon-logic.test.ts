import { describe, expect, it } from "vitest";
import {
  buildRibbonAriaLabel,
  buildRibbonTooltip,
  isVisibleOnMobile,
  MOBILE_FUTURE_DAYS,
  MOBILE_PAST_DAYS,
  shiftColorVar,
  type CycleRibbonDay,
} from "./cycle-ribbon-logic.ts";

function day(overrides: Partial<CycleRibbonDay> = {}): CycleRibbonDay {
  return {
    day: "2026-08-29",
    code: "M",
    label: "Matin",
    startTime: "05:00",
    endTime: "13:00",
    windows: [],
    hasActivity: false,
    hasPlannedUndone: false,
    isToday: false,
    isException: false,
    ...overrides,
  };
}

describe("isVisibleOnMobile", () => {
  it("garde exactement 4 jours passés, aujourd'hui, 9 à venir (14 au total)", () => {
    const visible = Array.from({ length: 21 }, (_, i) => i - 7).filter(isVisibleOnMobile);
    expect(visible).toHaveLength(1 + MOBILE_PAST_DAYS + MOBILE_FUTURE_DAYS);
    expect(Math.min(...visible)).toBe(-MOBILE_PAST_DAYS);
    expect(Math.max(...visible)).toBe(MOBILE_FUTURE_DAYS);
  });

  it("aujourd'hui (0) est toujours visible", () => {
    expect(isVisibleOnMobile(0)).toBe(true);
  });
});

describe("buildRibbonTooltip", () => {
  it("poste travaillé avec créneau libre", () => {
    const text = buildRibbonTooltip(
      day({ windows: [{ startMin: 780, endMin: 1200, durationMin: 420, allowsQuality: true, qualityStartMin: 780 }] }),
    );
    expect(text).toBe("Matin (05:00–13:00). Créneau libre : 13:00–20:00 (7 h).");
  });

  it("repos sans créneau", () => {
    const text = buildRibbonTooltip(day({ code: null, label: "Repos", startTime: null, endTime: null, windows: [] }));
    expect(text).toBe("Repos. Créneau libre : Aucun créneau exploitable.");
  });

  it("mentionne une activité réalisée", () => {
    const text = buildRibbonTooltip(day({ hasActivity: true }));
    expect(text).toContain("Activité réalisée");
  });

  it("mentionne une séance prévue non réalisée quand aucune activité n'a eu lieu", () => {
    const text = buildRibbonTooltip(day({ hasActivity: false, hasPlannedUndone: true }));
    expect(text).toContain("Séance prévue, pas encore réalisée");
  });

  it("ne mentionne pas la séance prévue si une activité a déjà eu lieu", () => {
    const text = buildRibbonTooltip(day({ hasActivity: true, hasPlannedUndone: true }));
    expect(text).not.toContain("prévue");
  });
});

describe("buildRibbonAriaLabel", () => {
  it("préfixe 'Aujourd'hui' quand isToday", () => {
    const label = buildRibbonAriaLabel(day({ isToday: true }));
    expect(label.startsWith("Aujourd'hui, ")).toBe(true);
  });

  it("signale un remplacement", () => {
    const label = buildRibbonAriaLabel(day({ isException: true }));
    expect(label).toContain("(remplacement)");
  });

  it("contient le jour de semaine et la date en français", () => {
    const label = buildRibbonAriaLabel(day({ day: "2026-08-29" }));
    expect(label).toMatch(/samedi 29 août/);
  });
});

describe("shiftColorVar", () => {
  it("mappe M/A/N sur leurs variables dédiées", () => {
    expect(shiftColorVar("M")).toBe("var(--color-shift-m)");
    expect(shiftColorVar("A")).toBe("var(--color-shift-a)");
    expect(shiftColorVar("N")).toBe("var(--color-shift-n)");
  });

  it("regroupe repos et codes hors M/A/N sur --color-rest", () => {
    expect(shiftColorVar(null)).toBe("var(--color-rest)");
    expect(shiftColorVar("C")).toBe("var(--color-rest)");
  });
});
