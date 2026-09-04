import { describe, expect, it } from "vitest";
import { exportFileName, resolvePeriod } from "./period.ts";

describe("resolvePeriod", () => {
  const today = "2026-08-30";

  it("7j -> 7 jours se terminant aujourd'hui", () => {
    expect(resolvePeriod("7j", today)).toEqual({ from: "2026-08-24", to: "2026-08-30" });
  });

  it("30j et 90j", () => {
    expect(resolvePeriod("30j", today)).toEqual({ from: "2026-08-01", to: "2026-08-30" });
    expect(resolvePeriod("90j", today)).toEqual({ from: "2026-06-02", to: "2026-08-30" });
  });

  it("tout -> depuis une borne large jusqu'à aujourd'hui", () => {
    const r = resolvePeriod("tout", today);
    expect(r!.to).toBe(today);
    expect(r!.from < "2020-01-01").toBe(true);
  });

  it("personnalise valide des bornes explicites", () => {
    expect(resolvePeriod("personnalise", today, { from: "2026-01-01", to: "2026-02-01" })).toEqual({
      from: "2026-01-01",
      to: "2026-02-01",
    });
  });

  it("personnalise sans 'to' retombe sur aujourd'hui", () => {
    expect(resolvePeriod("personnalise", today, { from: "2026-01-01" })).toEqual({
      from: "2026-01-01",
      to: today,
    });
  });

  it("personnalise refuse une plage invalide ou inversée", () => {
    expect(resolvePeriod("personnalise", today, {})).toBeNull();
    expect(resolvePeriod("personnalise", today, { from: "2026-09-01", to: "2026-08-01" })).toBeNull();
    expect(resolvePeriod("personnalise", today, { from: "pas-une-date" })).toBeNull();
  });
});

describe("exportFileName", () => {
  it("suit le format coach-export-<date>-<portee>.<ext>", () => {
    expect(exportFileName("2026-08-30", "7j", "md")).toBe("coach-export-2026-08-30-7j.md");
    expect(exportFileName("2026-08-30", "personnalise", "json")).toBe("coach-export-2026-08-30-personnalise.json");
  });
});
