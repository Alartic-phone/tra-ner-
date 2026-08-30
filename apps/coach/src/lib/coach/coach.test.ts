import { describe, expect, it } from "vitest";
import type { DayAvailability } from "../shifts/availability.ts";
import type { Day } from "../shifts/day.ts";
import type { ResolvedDay, ShiftCycle, ShiftTiming } from "../shifts/types.ts";
import type { ReplacementStats } from "../shifts/cycle.ts";
import { DEFAULT_SHIFT_CYCLE, DEFAULT_SHIFT_TIMINGS } from "../shifts/defaults.ts";
import type { CoachContext } from "./context.ts";
import { checkGuardrails } from "./guardrails.ts";
import { buildUserPrompt } from "./prompt.ts";
import { planOutputSchema, type PlanOutput, type WorkoutOutput } from "./schema.ts";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function availability(day: Day, overrides: Partial<DayAvailability> = {}): DayAvailability {
  return {
    day,
    code: null,
    isWorking: false,
    windows: [],
    maxSessionMin: 120,
    allowsQuality: true,
    allowsLongRun: true,
    blockers: [],
    ...overrides,
  };
}

const TODAY: Day = "2026-08-28";
const GOAL_DAY: Day = "2026-09-11"; // deux semaines plus tard, pour les tests de fenêtre

const REPLACEMENT_STATS: ReplacementStats = {
  from: TODAY,
  to: GOAL_DAY,
  totalDays: 14,
  theoreticalWorkDays: 8,
  theoreticalRestDays: 6,
  actualWorkDays: 8,
  replacementsAccepted: 0,
  daysFreed: 0,
  replacementRate: 0,
  workloadRatio: 1,
};

/** Contexte minimal, complet et valide, personnalisable au cas par cas. */
function makeContext(
  days: Array<[Day, Partial<DayAvailability>]>,
  overrides: Partial<CoachContext> = {},
): CoachContext {
  const byDay = new Map<Day, { resolved: ResolvedDay; availability: DayAvailability }>();
  const resolvedDays: ResolvedDay[] = [];
  for (const [day, avail] of days) {
    const full = availability(day, avail);
    const resolved: ResolvedDay = {
      day,
      code: full.code,
      theoreticalCode: full.code,
      isException: false,
      isReplacement: false,
      isFreed: false,
      isWorking: full.isWorking,
    };
    resolvedDays.push(resolved);
    byDay.set(day, { resolved, availability: full });
  }

  return {
    today: TODAY,
    goal: {
      id: "goal-1",
      name: "10 km",
      day: GOAL_DAY,
      distanceM: 10000,
      targetTimeS: 3840,
      floorTimeS: null,
      priority: "A",
    },
    weeksUntilGoal: 2,
    profile: null,
    vmaKmh: null,
    hrZones: null,
    paceZones: null,
    fitness: null,
    prediction: null,
    shiftRange: {
      cycle: DEFAULT_SHIFT_CYCLE satisfies ShiftCycle,
      timings: DEFAULT_SHIFT_TIMINGS satisfies ShiftTiming[],
      days: resolvedDays,
      availability: resolvedDays.map((d) => byDay.get(d.day)!.availability),
      byDay,
    },
    replacementStats: REPLACEMENT_STATS,
    injuryFlag: false,
    injuryNotes: [],
    dataCompleteness: [],
    ...overrides,
  };
}

function makeWorkout(overrides: Partial<WorkoutOutput> = {}): WorkoutOutput {
  return {
    day: TODAY,
    type: "endurance",
    title: "Footing",
    isKeySession: false,
    isProvisional: false,
    ...overrides,
  };
}

function makeOutput(workouts: WorkoutOutput[], overrides: Partial<PlanOutput> = {}): PlanOutput {
  return {
    phases: [
      { name: "base", startDay: TODAY, endDay: GOAL_DAY, focus: "Base aérobie", weeklyVolumeKm: 30 },
    ],
    workouts,
    reasoning: "Plan de test.",
    warnings: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// schema.ts
// ---------------------------------------------------------------------------

describe("planOutputSchema", () => {
  it("accepte une sortie minimale valide", () => {
    const parsed = planOutputSchema.safeParse(makeOutput([makeWorkout()]));
    expect(parsed.success).toBe(true);
  });

  it("rejette une séance sans jour", () => {
    const output = makeOutput([makeWorkout()]);
    // @ts-expect-error -- test volontaire d'une sortie non conforme
    delete output.workouts[0]!.day;
    expect(planOutputSchema.safeParse(output).success).toBe(false);
  });

  it("rejette un type de séance hors énumération", () => {
    const output = { ...makeOutput([makeWorkout()]) };
    output.workouts = [{ ...output.workouts[0]!, type: "sprint" as never }];
    expect(planOutputSchema.safeParse(output).success).toBe(false);
  });

  it("rejette une phase sans reasoning au niveau racine", () => {
    const output = { ...makeOutput([makeWorkout()]), reasoning: "" };
    expect(planOutputSchema.safeParse(output).success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// guardrails.ts
// ---------------------------------------------------------------------------

describe("checkGuardrails", () => {
  it("accepte une séance de qualité un jour qui l'autorise", () => {
    const context = makeContext([[TODAY, { allowsQuality: true }]]);
    const output = makeOutput([makeWorkout({ type: "seuil" })]);
    expect(checkGuardrails(output, context)).toEqual([]);
  });

  it("rejette une séance de qualité un jour qui l'interdit", () => {
    const context = makeContext([
      [TODAY, { allowsQuality: false, blockers: ["Séance de qualité interdite : nuit récente."] }],
    ]);
    const output = makeOutput([makeWorkout({ type: "vma" })]);
    const violations = checkGuardrails(output, context);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatch(/qualité/);
  });

  it("rejette une sortie longue un jour qui l'interdit", () => {
    const context = makeContext([
      [TODAY, { allowsLongRun: false, blockers: ["Sortie longue interdite : jour de poste de nuit."] }],
    ]);
    const output = makeOutput([makeWorkout({ type: "sortie_longue" })]);
    const violations = checkGuardrails(output, context);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatch(/longue/);
  });

  it("rejette une durée cible supérieure au créneau disponible", () => {
    const context = makeContext([[TODAY, { maxSessionMin: 45 }]]);
    const output = makeOutput([makeWorkout({ targetDurationS: 90 * 60 })]);
    const violations = checkGuardrails(output, context);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatch(/créneau/);
  });

  it("accepte une séance sur jour de repos sans contrainte violée", () => {
    const context = makeContext([[TODAY, { isWorking: false, maxSessionMin: 90 }]]);
    const output = makeOutput([makeWorkout({ type: "repos" })]);
    expect(checkGuardrails(output, context)).toEqual([]);
  });

  it("rejette une séance hors de la fenêtre du plan", () => {
    const context = makeContext([[TODAY, {}]]);
    const output = makeOutput([makeWorkout({ day: "2026-12-25" })]);
    const violations = checkGuardrails(output, context);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatch(/fenêtre/);
  });

  it("rejette une séance de qualité dans les 7 jours quand une douleur est signalée", () => {
    const context = makeContext([[TODAY, { allowsQuality: true }]], {
      injuryFlag: true,
      injuryNotes: ["Douleur genou d'intensité 8/10 le 2026-08-27."],
    });
    const output = makeOutput([makeWorkout({ type: "seuil" })]);
    const violations = checkGuardrails(output, context);
    expect(violations.some((v) => /douleur/i.test(v))).toBe(true);
  });

  it("accepte une séance d'endurance dans les 7 jours malgré une douleur signalée", () => {
    const context = makeContext([[TODAY, { allowsQuality: true }]], {
      injuryFlag: true,
      injuryNotes: ["Douleur genou d'intensité 8/10 le 2026-08-27."],
    });
    const output = makeOutput([makeWorkout({ type: "recuperation" })]);
    expect(checkGuardrails(output, context)).toEqual([]);
  });

  it("rejette une première semaine plus chargée que la deuxième en zone d'alerte ACWR", () => {
    const week2Day = "2026-09-05" as Day;
    const context = makeContext(
      [
        [TODAY, {}],
        [week2Day, {}],
      ],
      {
        fitness: { ctl: 40, atl: 60, tsb: -20, reliable: true, acwr: 1.8, acwrZone: "alerte" },
      },
    );
    const output = makeOutput([
      makeWorkout({ day: TODAY, targetDurationS: 6000 }),
      makeWorkout({ day: week2Day, targetDurationS: 3000 }),
    ]);
    const violations = checkGuardrails(output, context);
    expect(violations.some((v) => /alerte/i.test(v))).toBe(true);
  });

  it("accepte une première semaine allégée en zone d'alerte ACWR", () => {
    const week2Day = "2026-09-05" as Day;
    const context = makeContext(
      [
        [TODAY, {}],
        [week2Day, {}],
      ],
      {
        fitness: { ctl: 40, atl: 60, tsb: -20, reliable: true, acwr: 1.8, acwrZone: "alerte" },
      },
    );
    const output = makeOutput([
      makeWorkout({ day: TODAY, targetDurationS: 3000 }),
      makeWorkout({ day: week2Day, targetDurationS: 6000 }),
    ]);
    expect(checkGuardrails(output, context)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// prompt.ts
// ---------------------------------------------------------------------------

describe("buildUserPrompt", () => {
  it("mentionne l'objectif, le chrono visé et la fenêtre de préparation", () => {
    const context = makeContext([[TODAY, {}]]);
    const prompt = buildUserPrompt(context);
    expect(prompt).toContain("10 km");
    expect(prompt).toContain(GOAL_DAY);
    expect(prompt).toMatch(/2 semaines/);
  });

  it("signale l'alerte douleur quand injuryFlag est vrai", () => {
    const context = makeContext([[TODAY, {}]], {
      injuryFlag: true,
      injuryNotes: ["Douleur genou d'intensité 8/10 le 2026-08-27."],
    });
    const prompt = buildUserPrompt(context);
    expect(prompt).toMatch(/ALERTE DOULEUR/);
    expect(prompt).toContain("Douleur genou");
  });

  it("liste les données non disponibles sans les combler", () => {
    const context = makeContext([[TODAY, {}]], {
      dataCompleteness: ["VMA non renseignée : zones d'allure non disponibles."],
    });
    const prompt = buildUserPrompt(context);
    expect(prompt).toContain("VMA non renseignée");
  });
});
