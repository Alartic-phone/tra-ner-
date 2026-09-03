import { describe, expect, it } from "vitest";
import { momentForContext, momentForHour, pickPhoto, type PhotoManifestEntry } from "./photos.ts";

function entry(id: string, moment: PhotoManifestEntry["moment"]): PhotoManifestEntry {
  return {
    id,
    moment,
    file1600: `${moment}/${id}-1600.webp`,
    file800: `${moment}/${id}-800.webp`,
    blurDataUrl: "data:image/webp;base64,AA==",
    source: "unsplash",
    sourceUrl: "https://unsplash.com/x",
    author: "Test",
    authorUrl: "https://unsplash.com/@test",
    license: "Unsplash License",
  };
}

describe("momentForContext", () => {
  it("associe chaque poste travaillé à son moment", () => {
    expect(momentForContext({ shiftCode: "M", isWorking: true, hour: 6 })).toBe("aube");
    expect(momentForContext({ shiftCode: "A", isWorking: true, hour: 14 })).toBe("jour");
    expect(momentForContext({ shiftCode: "N", isWorking: true, hour: 22 })).toBe("nuit");
  });

  it("suit l'heure réelle au repos, pas le cycle théorique", () => {
    expect(momentForContext({ shiftCode: null, isWorking: false, hour: 7 })).toBe("aube");
    expect(momentForContext({ shiftCode: null, isWorking: false, hour: 14 })).toBe("jour");
    expect(momentForContext({ shiftCode: null, isWorking: false, hour: 20 })).toBe("soir");
    expect(momentForContext({ shiftCode: null, isWorking: false, hour: 2 })).toBe("nuit");
  });

  it("suit l'heure réelle pour un code de poste inconnu", () => {
    expect(momentForContext({ shiftCode: "X", isWorking: true, hour: 20 })).toBe("soir");
  });
});

describe("momentForHour", () => {
  it("couvre les 24 h sans trou ni chevauchement", () => {
    for (let h = 0; h < 24; h++) {
      expect(["aube", "jour", "soir", "nuit"]).toContain(momentForHour(h));
    }
  });

  it("place les bornes exactement", () => {
    expect(momentForHour(4)).toBe("nuit");
    expect(momentForHour(5)).toBe("aube");
    expect(momentForHour(10)).toBe("aube");
    expect(momentForHour(11)).toBe("jour");
    expect(momentForHour(17)).toBe("jour");
    expect(momentForHour(18)).toBe("soir");
    expect(momentForHour(21)).toBe("soir");
    expect(momentForHour(22)).toBe("nuit");
  });
});

describe("pickPhoto", () => {
  const manifest = [
    entry("a1", "aube"),
    entry("a2", "aube"),
    entry("j1", "jour"),
    entry("s1", "soir"),
  ];

  it("est déterministe pour un même jour et un même moment", () => {
    const first = pickPhoto("2026-08-29", "aube", manifest);
    const second = pickPhoto("2026-08-29", "aube", manifest);
    expect(first).toEqual(second);
  });

  it("ne choisit que dans le moment demandé", () => {
    const picked = pickPhoto("2026-08-29", "aube", manifest);
    expect(picked?.moment).toBe("aube");
  });

  it("varie selon le jour quand plusieurs photos existent", () => {
    const days = Array.from({ length: 30 }, (_, i) => `2026-08-${String(i + 1).padStart(2, "0")}`);
    const picks = new Set(days.map((d) => pickPhoto(d, "aube", manifest)?.id));
    expect(picks.size).toBeGreaterThan(1);
  });

  it("renvoie null quand le pack ne couvre pas ce moment (pack absent)", () => {
    expect(pickPhoto("2026-08-29", "nuit", manifest)).toBeNull();
  });

  it("renvoie null sur un manifeste vide", () => {
    expect(pickPhoto("2026-08-29", "aube", [])).toBeNull();
  });
});
