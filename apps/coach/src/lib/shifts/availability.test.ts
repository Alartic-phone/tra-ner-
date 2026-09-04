import { describe, expect, it } from "vitest";
import {
  DEFAULT_AVAILABILITY_RULES,
  computeAvailability,
  computeDayAvailability,
  timingsToMap,
} from "./availability.ts";
import { resolveRange, toExceptionMap } from "./cycle.ts";
import { DEFAULT_SHIFT_CYCLE, DEFAULT_SHIFT_TIMINGS } from "./defaults.ts";
import { minutesToTime } from "./day.ts";
import type { ResolvedDay } from "./types.ts";

const TIMINGS = timingsToMap(DEFAULT_SHIFT_TIMINGS);
const RULES = DEFAULT_AVAILABILITY_RULES;

function day(d: string, code: string | null): ResolvedDay {
  return {
    day: d,
    code,
    theoreticalCode: code,
    isException: false,
    isReplacement: false,
    isFreed: false,
    isWorking: code !== null,
  };
}

describe("créneaux disponibles", () => {
  it("libère la journée entière un jour de repos isolé", () => {
    const a = computeDayAvailability(
      day("2026-09-05", null),
      day("2026-09-04", null),
      day("2026-09-06", null),
      TIMINGS,
      RULES,
    );
    expect(a.isWorking).toBe(false);
    expect(a.windows).toHaveLength(1);
    expect(minutesToTime(a.windows[0]!.startMin)).toBe("06:30");
    expect(minutesToTime(a.windows[0]!.endMin)).toBe("22:30");
    expect(a.maxSessionMin).toBe(960);
    expect(a.allowsQuality).toBe(true);
    expect(a.allowsLongRun).toBe(true);
  });

  it("plafonne la séance un jour de poste du matin", () => {
    // Poste 05:00-13:00, suivi d'un autre poste du matin : le créneau
    // s'arrête au coucher anticipé.
    const a = computeDayAvailability(
      day("2026-08-27", "M"),
      day("2026-08-26", "M"),
      day("2026-08-28", "M"),
      TIMINGS,
      RULES,
    );
    expect(a.windows).toHaveLength(1);
    expect(minutesToTime(a.windows[0]!.startMin)).toBe("14:00");
    expect(minutesToTime(a.windows[0]!.endMin)).toBe("21:00");
    // Le créneau brut fait 7 h, mais une séance un jour travaillé est plafonnée.
    expect(a.windows[0]!.durationMin).toBe(420);
    expect(a.maxSessionMin).toBe(RULES.maxSessionOnWorkDayMin);
  });

  it("laisse la journée avant un poste de nuit, sommeil nocturne inclus", () => {
    const a = computeDayAvailability(
      day("2026-10-02", "N"),
      day("2026-10-01", "A"),
      day("2026-10-03", "N"),
      TIMINGS,
      RULES,
    );
    expect(a.windows).toHaveLength(1);
    expect(minutesToTime(a.windows[0]!.startMin)).toBe("06:30");
    expect(minutesToTime(a.windows[0]!.endMin)).toBe("20:00");
  });

  it("place le créneau l'après-midi entre deux nuits consécutives", () => {
    // Sortie de nuit à 05:00, sommeil de jour, puis reprise à 21:00.
    const a = computeDayAvailability(
      day("2026-10-03", "N"),
      day("2026-10-02", "N"),
      day("2026-10-04", "N"),
      TIMINGS,
      RULES,
    );
    expect(a.windows).toHaveLength(1);
    expect(minutesToTime(a.windows[0]!.startMin)).toBe("13:00");
    expect(minutesToTime(a.windows[0]!.endMin)).toBe("20:00");
  });
});

describe("contraintes physiologiques (§6.3)", () => {
  it("interdit la qualité dans les 12 h suivant une sortie de nuit", () => {
    // Sortie de nuit le 5 octobre à 05:00 : rien de qualitatif avant 17:00.
    const a = computeDayAvailability(
      day("2026-10-05", null),
      day("2026-10-04", "N"),
      day("2026-10-06", null),
      TIMINGS,
      RULES,
    );
    expect(a.windows).toHaveLength(1);
    expect(minutesToTime(a.windows[0]!.startMin)).toBe("13:00");
    expect(a.allowsQuality).toBe(true);
    expect(minutesToTime(a.windows[0]!.qualityStartMin!)).toBe("17:00");
  });

  it("bloque totalement la qualité quand le créneau restant est trop court", () => {
    const strict = { ...RULES, qualityBlockAfterNightH: 20 };
    const a = computeDayAvailability(
      day("2026-10-05", null),
      day("2026-10-04", "N"),
      day("2026-10-06", null),
      TIMINGS,
      strict,
    );
    expect(a.allowsQuality).toBe(false);
    expect(a.blockers.some((b) => b.includes("sortie de nuit"))).toBe(true);
  });

  it("interdit la sortie longue un jour de poste de nuit", () => {
    const a = computeDayAvailability(
      day("2026-10-03", "N"),
      day("2026-10-02", "N"),
      day("2026-10-04", "N"),
      TIMINGS,
      RULES,
    );
    expect(a.allowsLongRun).toBe(false);
    expect(a.blockers).toContain("Sortie longue interdite : jour de poste de nuit.");
  });

  it("interdit la sortie longue la veille d'une entrée en nuit", () => {
    // 1er octobre : poste d'après-midi, le 2 démarre la série de nuits.
    const a = computeDayAvailability(
      day("2026-10-01", "A"),
      day("2026-09-30", "A"),
      day("2026-10-02", "N"),
      TIMINGS,
      RULES,
    );
    expect(a.allowsLongRun).toBe(false);
    expect(a.blockers).toContain(
      "Sortie longue interdite : veille d'une entrée en nuit.",
    );
  });

  it("autorise la sortie longue un jour de repos hors influence des nuits", () => {
    const a = computeDayAvailability(
      day("2026-09-08", null),
      day("2026-09-07", null),
      day("2026-09-09", null),
      TIMINGS,
      RULES,
    );
    expect(a.allowsLongRun).toBe(true);
    expect(a.blockers).toEqual([]);
  });

  it("référence : un créneau tardif et court après un poste d'après-midi n'est jamais « qualité »", () => {
    // Poste A (13:00-21:00) + 45 min de tampon -> créneau libre 21:45-22:30,
    // 45 min : reproduit le cas réel signalé (affiché à tort « qualité
    // possible »). Trop tard ET trop court pour de la qualité, mais toujours
    // exploitable pour une séance facile.
    const custom = { ...RULES, bufferAfterMin: 45 };
    const a = computeDayAvailability(
      day("2026-08-27", "A"),
      day("2026-08-26", null),
      day("2026-08-28", null),
      TIMINGS,
      custom,
    );
    // Le poste laisse aussi une matinée libre (06:30-12:00) : seul le
    // créneau du soir nous intéresse ici, c'est lui qui reproduit le bug.
    const evening = a.windows[a.windows.length - 1]!;
    expect(minutesToTime(evening.startMin)).toBe("21:45");
    expect(minutesToTime(evening.endMin)).toBe("22:30");
    expect(evening.durationMin).toBe(45);
    expect(evening.allowsQuality).toBe(false);
  });

  it("un créneau de moins de 60 min ne permet pas la qualité même en journée", () => {
    // Isole la règle de durée de celle d'horaire tardif : fenêtre 10:00-10:50
    // (50 min), bien avant le seuil de soirée.
    const custom = { ...RULES, wakeTime: "10:00", bedTime: "10:50" };
    const a = computeDayAvailability(
      day("2026-09-05", null),
      day("2026-09-04", null),
      day("2026-09-06", null),
      TIMINGS,
      custom,
    );
    expect(a.windows).toHaveLength(1);
    expect(a.windows[0]!.durationMin).toBe(50);
    expect(a.windows[0]!.allowsQuality).toBe(false);
  });

  it("un créneau de 60 min ou plus, avant le seuil de soirée, reste éligible à la qualité", () => {
    const custom = { ...RULES, wakeTime: "10:00", bedTime: "11:00" };
    const a = computeDayAvailability(
      day("2026-09-05", null),
      day("2026-09-04", null),
      day("2026-09-06", null),
      TIMINGS,
      custom,
    );
    expect(a.windows[0]!.durationMin).toBe(60);
    expect(a.windows[0]!.allowsQuality).toBe(true);
  });

  it("respecte des règles personnalisées sans changer de code", () => {
    const custom = { ...RULES, maxSessionOnWorkDayMin: 45, minSessionMin: 60 };
    const a = computeDayAvailability(
      day("2026-08-27", "M"),
      day("2026-08-26", "M"),
      day("2026-08-28", "M"),
      TIMINGS,
      custom,
    );
    expect(a.maxSessionMin).toBe(45);
  });
});

describe("disponibilité sur le cycle complet", () => {
  const resolved = resolveRange(
    DEFAULT_SHIFT_CYCLE,
    "2026-08-26",
    "2026-10-13",
    toExceptionMap([]),
  );
  const availability = computeAvailability(resolved, TIMINGS, RULES);

  it("couvre les 49 jours du cycle", () => {
    expect(availability).toHaveLength(49);
  });

  it("ne laisse aucune journée sans créneau exploitable", () => {
    // Aucun poste du cycle de référence ne sature une journée entière : si un
    // jour se retrouvait sans créneau, c'est que les horaires saisis sont
    // incohérents.
    expect(availability.filter((a) => a.windows.length === 0)).toEqual([]);
  });

  it("compte 7 jours de nuit, tous interdits à la sortie longue", () => {
    const nights = availability.filter((a) => a.code === "N");
    expect(nights).toHaveLength(7);
    expect(nights.every((a) => !a.allowsLongRun)).toBe(true);
  });

  it("réserve les plus longs créneaux aux jours de repos", () => {
    const rest = availability.filter((a) => !a.isWorking);
    const work = availability.filter((a) => a.isWorking);
    const maxWork = Math.max(...work.map((a) => a.maxSessionMin));
    const minRest = Math.min(...rest.map((a) => a.maxSessionMin));
    expect(minRest).toBeGreaterThan(maxWork);
  });

  it("prend en compte un remplacement accepté sur un jour de repos", () => {
    const withReplacement = resolveRange(
      DEFAULT_SHIFT_CYCLE,
      "2026-08-26",
      "2026-10-13",
      toExceptionMap([{ day: "2026-09-05", code: "N" }]),
    );
    const after = computeAvailability(withReplacement, TIMINGS, RULES);
    const impacted = after.find((a) => a.day === "2026-09-05")!;
    expect(impacted.isWorking).toBe(true);
    expect(impacted.allowsLongRun).toBe(false);
    // La veille perd elle aussi sa sortie longue : entrée en nuit le lendemain.
    const eve = after.find((a) => a.day === "2026-09-04")!;
    expect(eve.allowsLongRun).toBe(false);
  });
});
