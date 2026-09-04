import { describe, expect, it } from "vitest";
import {
  addDays,
  diffDays,
  eachDay,
  minutesToTime,
  mondayOf,
  timeToMinutes,
  weekdayLabel,
  weekdayOf,
} from "./day.ts";
import {
  computeReplacementStats,
  cycleLength,
  expandCycle,
  findTripleShiftViolations,
  offsetInCycle,
  resolveDay,
  resolveRange,
  theoreticalCodeForDay,
  toExceptionMap,
  validateCycle,
} from "./cycle.ts";
import { DEFAULT_SHIFT_CYCLE } from "./defaults.ts";
import type { ShiftCycle } from "./types.ts";

const CYCLE = DEFAULT_SHIFT_CYCLE;
const NO_EXCEPTIONS = toExceptionMap([]);

describe("arithmétique de jours", () => {
  it("ajoute et soustrait des jours sans dérive au changement d'heure", () => {
    // Passage à l'heure d'hiver 2026 en France : nuit du 24 au 25 octobre.
    expect(addDays("2026-10-24", 1)).toBe("2026-10-25");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(diffDays("2026-10-24", "2026-10-26")).toBe(2);
    // Passage à l'heure d'été 2027 : nuit du 27 au 28 mars.
    expect(addDays("2027-03-27", 1)).toBe("2027-03-28");
    expect(diffDays("2027-03-27", "2027-03-29")).toBe(2);
  });

  it("référence : compte à rebours d'une course (30/08 -> 25/10 = 56 jours)", () => {
    // Tableau de bord, carte « Prochaine course » : Goal.day est une chaîne
    // de jour, jamais un DateTime — diffDays doit rester exact sur un écart
    // de deux mois traversant août/septembre/octobre.
    expect(diffDays("2026-08-30", "2026-10-25")).toBe(56);
  });

  it("gère les années bissextiles", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
  });

  it("rejette une date inexistante", () => {
    expect(() => addDays("2026-02-30", 1)).toThrow();
  });

  it("calcule le lundi de la semaine", () => {
    expect(mondayOf("2026-08-26")).toBe("2026-08-24"); // mercredi -> lundi
    expect(mondayOf("2026-08-24")).toBe("2026-08-24"); // lundi -> lui-même
    expect(mondayOf("2026-08-30")).toBe("2026-08-24"); // dimanche -> lundi
  });

  it("convertit les horaires", () => {
    expect(timeToMinutes("05:30")).toBe(330);
    expect(minutesToTime(330)).toBe("05:30");
    expect(minutesToTime(1500)).toBe("01:00"); // débordement au lendemain
    expect(() => timeToMinutes("25:00")).toThrow();
  });

  it("énumère une plage inclusive", () => {
    expect(eachDay("2026-08-26", "2026-08-28")).toEqual([
      "2026-08-26",
      "2026-08-27",
      "2026-08-28",
    ]);
    expect(eachDay("2026-08-28", "2026-08-26")).toEqual([]);
  });
});

describe("définition du cycle", () => {
  it("mesure 49 jours, soit exactement 7 semaines", () => {
    expect(cycleLength(CYCLE)).toBe(49);
    expect(cycleLength(CYCLE) % 7).toBe(0);
  });

  it("est valide", () => {
    expect(validateCycle(CYCLE)).toEqual([]);
  });

  it("détecte une définition invalide", () => {
    const broken: ShiftCycle = { anchorDay: "pas-une-date", blocks: [] };
    expect(validateCycle(broken).length).toBeGreaterThan(0);
  });

  it("compte 21 jours travaillés et 28 jours de repos par cycle", () => {
    const expanded = expandCycle(CYCLE);
    expect(expanded).toHaveLength(49);
    expect(expanded.filter((d) => d.code !== null)).toHaveLength(21);
    expect(expanded.filter((d) => d.code === null)).toHaveLength(28);
  });

  it("positionne correctement le premier jour de chaque bloc", () => {
    expect(offsetInCycle(CYCLE, "2026-08-26")).toBe(0);
    expect(theoreticalCodeForDay(CYCLE, "2026-08-26")).toBe("M");
    // Bloc 2 : 7 postes + 9 repos = jour 16 du cycle.
    expect(offsetInCycle(CYCLE, "2026-09-11")).toBe(16);
    // Bloc 3 : + 7 postes + 10 repos = jour 33.
    expect(offsetInCycle(CYCLE, "2026-09-28")).toBe(33);
  });

  it("reste défini avant le jour d'ancrage", () => {
    // Un cycle complet en arrière retombe sur le même code.
    expect(theoreticalCodeForDay(CYCLE, addDays("2026-08-26", -49))).toBe("M");
    expect(offsetInCycle(CYCLE, addDays("2026-08-26", -1))).toBe(48);
  });

  it("se reboucle exactement au bout de 49 jours", () => {
    for (const day of eachDay("2026-08-26", "2026-10-13")) {
      expect(theoreticalCodeForDay(CYCLE, addDays(day, 49))).toBe(
        theoreticalCodeForDay(CYCLE, day),
      );
    }
  });

  it("retombe sur les mêmes jours de semaine d'un cycle à l'autre", () => {
    for (const day of eachDay("2026-08-26", "2026-10-13")) {
      expect(weekdayOf(addDays(day, 49))).toBe(weekdayOf(day));
    }
  });
});

describe("séquence des blocs", () => {
  it("déroule le bloc 1 : M M A A A N N à partir du mercredi 26 août 2026", () => {
    const codes = eachDay("2026-08-26", "2026-09-01").map((d) =>
      theoreticalCodeForDay(CYCLE, d),
    );
    expect(codes).toEqual(["M", "M", "A", "A", "A", "N", "N"]);
  });

  it("déroule le bloc 2 : M M M A A N N à partir du vendredi 11 septembre", () => {
    const codes = eachDay("2026-09-11", "2026-09-17").map((d) =>
      theoreticalCodeForDay(CYCLE, d),
    );
    expect(codes).toEqual(["M", "M", "M", "A", "A", "N", "N"]);
  });

  it("déroule le bloc 3 : M M A A N N N à partir du lundi 28 septembre", () => {
    const codes = eachDay("2026-09-28", "2026-10-04").map((d) =>
      theoreticalCodeForDay(CYCLE, d),
    );
    expect(codes).toEqual(["M", "M", "A", "A", "N", "N", "N"]);
  });

  it("place 9, 10 puis 9 jours de repos entre les blocs", () => {
    const repos1 = eachDay("2026-09-02", "2026-09-10");
    const repos2 = eachDay("2026-09-18", "2026-09-27");
    const repos3 = eachDay("2026-10-05", "2026-10-13");
    expect(repos1).toHaveLength(9);
    expect(repos2).toHaveLength(10);
    expect(repos3).toHaveLength(9);
    for (const day of [...repos1, ...repos2, ...repos3]) {
      expect(theoreticalCodeForDay(CYCLE, day)).toBeNull();
    }
  });
});

describe("cas de test imposés (§6.1)", () => {
  it("28-30 août 2026 : après-midi, vendredi/samedi/dimanche", () => {
    for (const day of ["2026-08-28", "2026-08-29", "2026-08-30"]) {
      expect(theoreticalCodeForDay(CYCLE, day)).toBe("A");
    }
    expect(eachDay("2026-08-28", "2026-08-30").map(weekdayLabel)).toEqual([
      "vendredi",
      "samedi",
      "dimanche",
    ]);
  });

  it("11-13 septembre 2026 : matin, vendredi/samedi/dimanche", () => {
    for (const day of ["2026-09-11", "2026-09-12", "2026-09-13"]) {
      expect(theoreticalCodeForDay(CYCLE, day)).toBe("M");
    }
    expect(eachDay("2026-09-11", "2026-09-13").map(weekdayLabel)).toEqual([
      "vendredi",
      "samedi",
      "dimanche",
    ]);
  });

  it("2-4 octobre 2026 : nuit, vendredi/samedi/dimanche", () => {
    for (const day of ["2026-10-02", "2026-10-03", "2026-10-04"]) {
      expect(theoreticalCodeForDay(CYCLE, day)).toBe("N");
    }
    expect(eachDay("2026-10-02", "2026-10-04").map(weekdayLabel)).toEqual([
      "vendredi",
      "samedi",
      "dimanche",
    ]);
  });

  it("14 octobre 2026 : matin, premier jour d'un nouveau bloc 1", () => {
    expect(theoreticalCodeForDay(CYCLE, "2026-10-14")).toBe("M");
    expect(weekdayLabel("2026-10-14")).toBe("mercredi");
    expect(offsetInCycle(CYCLE, "2026-10-14")).toBe(0);
    expect(diffDays("2026-08-26", "2026-10-14")).toBe(49);
  });
});

describe("invariante de non-régression du calendrier (§6.1)", () => {
  it("les trois postes identiques consécutifs tombent toujours ven/sam/dim", () => {
    // Contrôlé sur cinq ans, soit une quarantaine de cycles complets.
    const violations = findTripleShiftViolations(CYCLE, "2026-01-01", "2031-01-01");
    expect(violations).toEqual([]);
  });

  it("détecte bien une violation si le cycle est faussé", () => {
    // Un cycle de 48 jours (repos raccourci d'un jour) n'est plus un multiple
    // de 7 : la propriété doit tomber immédiatement.
    const broken: ShiftCycle = {
      anchorDay: "2026-08-26",
      blocks: [
        { sequence: "MMAAANN", restDays: 8 },
        { sequence: "MMMAANN", restDays: 10 },
        { sequence: "MMAANNN", restDays: 9 },
      ],
    };
    expect(cycleLength(broken)).toBe(48);
    const violations = findTripleShiftViolations(broken, "2026-01-01", "2027-01-01");
    expect(violations.length).toBeGreaterThan(0);
  });

  it("trouve exactement un triplet par bloc et par cycle", () => {
    // 3 blocs contiennent chacun exactement une série de trois postes
    // identiques (AAA, MMM, NNN).
    const days = eachDay("2026-08-26", "2026-10-13");
    let triplets = 0;
    for (let i = 0; i + 2 < days.length; i++) {
      const a = theoreticalCodeForDay(CYCLE, days[i]!);
      if (a === null) continue;
      const b = theoreticalCodeForDay(CYCLE, days[i + 1]!);
      const c = theoreticalCodeForDay(CYCLE, days[i + 2]!);
      if (a === b && b === c) triplets++;
    }
    expect(triplets).toBe(3);
  });
});

describe("exceptions ponctuelles (§6.2 bis)", () => {
  it("transforme un jour de repos en poste et le marque comme remplacement", () => {
    const exceptions = toExceptionMap([{ day: "2026-09-05", code: "A" }]);
    const resolved = resolveDay(CYCLE, "2026-09-05", exceptions);
    expect(resolved.theoreticalCode).toBeNull();
    expect(resolved.code).toBe("A");
    expect(resolved.isReplacement).toBe(true);
    expect(resolved.isFreed).toBe(false);
    expect(resolved.isWorking).toBe(true);
  });

  it("libère un jour théoriquement travaillé", () => {
    const exceptions = toExceptionMap([{ day: "2026-08-28", code: null }]);
    const resolved = resolveDay(CYCLE, "2026-08-28", exceptions);
    expect(resolved.theoreticalCode).toBe("A");
    expect(resolved.code).toBeNull();
    expect(resolved.isFreed).toBe(true);
    expect(resolved.isReplacement).toBe(false);
    expect(resolved.isWorking).toBe(false);
  });

  it("échange un poste contre un autre sans compter de remplacement", () => {
    const exceptions = toExceptionMap([{ day: "2026-08-28", code: "N" }]);
    const resolved = resolveDay(CYCLE, "2026-08-28", exceptions);
    expect(resolved.theoreticalCode).toBe("A");
    expect(resolved.code).toBe("N");
    expect(resolved.isReplacement).toBe(false);
    expect(resolved.isFreed).toBe(false);
  });

  it("n'affecte que son jour, sans aucune récurrence", () => {
    const exceptions = toExceptionMap([{ day: "2026-09-05", code: "A" }]);
    const range = resolveRange(CYCLE, "2026-09-02", "2026-09-10", exceptions);
    expect(range.filter((d) => d.isException)).toHaveLength(1);
    // Le même jour de semaine, la semaine suivante, reste au repos.
    expect(resolveDay(CYCLE, "2026-09-12", exceptions).isException).toBe(false);
  });
});

describe("statistiques de remplacement", () => {
  it("mesure un cycle théorique sans exception", () => {
    const stats = computeReplacementStats(
      CYCLE,
      "2026-08-26",
      "2026-10-13",
      NO_EXCEPTIONS,
    );
    expect(stats.totalDays).toBe(49);
    expect(stats.theoreticalWorkDays).toBe(21);
    expect(stats.theoreticalRestDays).toBe(28);
    expect(stats.actualWorkDays).toBe(21);
    expect(stats.replacementsAccepted).toBe(0);
    expect(stats.replacementRate).toBe(0);
    expect(stats.workloadRatio).toBe(1);
  });

  it("mesure le surtravail réel quand des remplacements sont acceptés", () => {
    const exceptions = toExceptionMap([
      { day: "2026-09-05", code: "A" },
      { day: "2026-09-06", code: "A" },
      { day: "2026-09-20", code: "N" },
      { day: "2026-10-08", code: "M" },
    ]);
    const stats = computeReplacementStats(
      CYCLE,
      "2026-08-26",
      "2026-10-13",
      exceptions,
    );
    expect(stats.replacementsAccepted).toBe(4);
    expect(stats.actualWorkDays).toBe(25);
    expect(stats.replacementRate).toBeCloseTo(4 / 28, 6);
    expect(stats.workloadRatio).toBeCloseTo(25 / 21, 6);
  });

  it("compte séparément les jours libérés", () => {
    const exceptions = toExceptionMap([
      { day: "2026-09-05", code: "A" },
      { day: "2026-08-28", code: null },
    ]);
    const stats = computeReplacementStats(
      CYCLE,
      "2026-08-26",
      "2026-10-13",
      exceptions,
    );
    expect(stats.replacementsAccepted).toBe(1);
    expect(stats.daysFreed).toBe(1);
    expect(stats.actualWorkDays).toBe(21);
  });
});
