import { describe, expect, it } from "vitest";
import {
  buildTodayPhrase,
  buildAxisTicks,
  buildWeeklyLoadBars,
  daysLeftInWeek,
  detectVigilancePoints,
  niceAxisStep,
} from "./home.ts";

describe("buildTodayPhrase", () => {
  it("poste travaillé avec matinée libre jusqu'à une heure donnée", () => {
    const phrase = buildTodayPhrase({
      isWorking: true,
      shiftLabel: "Après-midi",
      windows: [{ startMin: 0, endMin: 735, durationMin: 735, allowsQuality: true, qualityStartMin: 0 }],
    });
    expect(phrase).toBe("Poste après-midi · matinée libre jusqu'à 12 h 15");
  });

  it("repos avec la journée entièrement libre", () => {
    const phrase = buildTodayPhrase({
      isWorking: false,
      shiftLabel: "Repos",
      windows: [{ startMin: 0, endMin: 1440, durationMin: 1440, allowsQuality: true, qualityStartMin: 0 }],
    });
    expect(phrase).toBe("Repos · libre toute la journée");
  });

  it("aucun créneau exploitable", () => {
    const phrase = buildTodayPhrase({ isWorking: true, shiftLabel: "Nuit", windows: [] });
    expect(phrase).toBe("Poste nuit.");
  });

  it("créneau qui se termine à la fin de journée -> 'à partir de'", () => {
    const phrase = buildTodayPhrase({
      isWorking: true,
      shiftLabel: "Matin",
      windows: [{ startMin: 900, endMin: 1440, durationMin: 540, allowsQuality: true, qualityStartMin: 900 }],
    });
    expect(phrase).toContain("libre à partir de 15 h 00");
  });

  it("créneau au milieu de journée -> 'de X à Y'", () => {
    const phrase = buildTodayPhrase({
      isWorking: false,
      shiftLabel: "Repos",
      windows: [{ startMin: 600, endMin: 900, durationMin: 300, allowsQuality: true, qualityStartMin: 600 }],
    });
    expect(phrase).toContain("libre de 10 h 00 à 15 h 00");
  });

  it("choisit le créneau le plus long quand il y en a plusieurs", () => {
    const phrase = buildTodayPhrase({
      isWorking: true,
      shiftLabel: "Nuit",
      windows: [
        { startMin: 0, endMin: 60, durationMin: 60, allowsQuality: false, qualityStartMin: null },
        { startMin: 700, endMin: 1440, durationMin: 740, allowsQuality: true, qualityStartMin: 700 },
      ],
    });
    expect(phrase).toContain("à partir de 11 h 40");
  });
});

describe("niceAxisStep / buildAxisTicks", () => {
  it("choisit toujours un pas parmi 1/2/2,5/5/10 (jamais un pas arbitraire)", () => {
    expect(niceAxisStep(0.9)).toBe(1);
    expect(niceAxisStep(1.4)).toBe(2);
    expect(niceAxisStep(2.2)).toBe(2.5);
    expect(niceAxisStep(4)).toBe(5);
    expect(niceAxisStep(8)).toBe(10);
    expect(niceAxisStep(24)).toBe(25);
  });

  it("produit des graduations rondes couvrant la valeur max (cas du rapport de bug : 24,68 km)", () => {
    const ticks = buildAxisTicks(24.68, 4);
    expect(ticks[0]).toBe(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(24.68);
    for (const t of ticks) expect(Number.isInteger(t * 2)).toBe(true); // 0/2,5/5/10... jamais 0,95
  });
});

describe("buildWeeklyLoadBars", () => {
  const weeks = [
    { weekStart: "2026-08-24", realizedKm: 24.68, plannedKm: null },
    { weekStart: "2026-08-31", realizedKm: 12.79, plannedKm: null },
    { weekStart: "2026-09-07", realizedKm: 0, plannedKm: 20 },
    { weekStart: "2026-09-14", realizedKm: 0, plannedKm: 10 }, // allégée
    { weekStart: "2026-09-21", realizedKm: 0, plannedKm: 22 },
  ];

  it("marque réalisé/en cours/prévu selon la position par rapport à aujourd'hui", () => {
    const bars = buildWeeklyLoadBars(weeks, "2026-08-31");
    expect(bars[0]!.state).toBe("done");
    expect(bars[1]!.state).toBe("current");
    expect(bars[2]!.state).toBe("planned");
    expect(bars[4]!.state).toBe("planned");
  });

  it("détecte une semaine allégée (volume prévu nettement sous la précédente)", () => {
    const bars = buildWeeklyLoadBars(weeks, "2026-08-31");
    expect(bars[3]!.state).toBe("planned-deload");
  });

  it("numérote les semaines à partir de 1", () => {
    const bars = buildWeeklyLoadBars(weeks, "2026-08-31");
    expect(bars.map((b) => b.index)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("daysLeftInWeek", () => {
  it("0 le dimanche (fin de semaine calendaire lundi-dimanche)", () => {
    expect(daysLeftInWeek("2026-09-06")).toBe(0); // un dimanche réel
  });
  it("6 le lundi", () => {
    expect(daysLeftInWeek("2026-08-31")).toBe(6);
  });
});

describe("detectVigilancePoints", () => {
  const base = {
    today: "2026-09-06",
    daysSinceLastWeighing: 5,
    daysSinceLastStrength: 3,
    daysLeftInWeek: 3,
    weekRealizedKm: 18,
    weekTargetKm: 20,
    weekOutOfZone12Fraction: 0.1,
    suspiciousActivities: [],
  };

  it("ne signale rien quand tout est dans les clous", () => {
    expect(detectVigilancePoints(base)).toEqual([]);
  });

  it("signale une pesée jamais enregistrée, distinctement d'une pesée ancienne", () => {
    const never = detectVigilancePoints({ ...base, daysSinceLastWeighing: null });
    expect(never[0]!.action).toContain("Aucune pesée");

    const old = detectVigilancePoints({ ...base, daysSinceLastWeighing: 20 });
    expect(old[0]!.action).toContain("20 jours");
  });

  it("signale le renforcement au-delà de 10 jours, pas avant", () => {
    expect(detectVigilancePoints({ ...base, daysSinceLastStrength: 10 })).toEqual([]);
    expect(detectVigilancePoints({ ...base, daysSinceLastStrength: 11 })[0]!.title).toBe("Renforcement");
  });

  it("signale un déficit de volume seulement combiné à moins de deux jours restants", () => {
    // Déficit réel mais encore trois jours pour rattraper : pas d'alerte.
    expect(detectVigilancePoints({ ...base, weekRealizedKm: 5, daysLeftInWeek: 3 })).toEqual([]);
    const alert = detectVigilancePoints({ ...base, weekRealizedKm: 5, daysLeftInWeek: 1 });
    expect(alert[0]!.level).toBe("bloquant");
    expect(alert[0]!.title).toBe("Volume de la semaine");
  });

  it("signale l'intensité au-delà de 25 % hors zone 1-2", () => {
    expect(detectVigilancePoints({ ...base, weekOutOfZone12Fraction: 0.25 })).toEqual([]);
    expect(detectVigilancePoints({ ...base, weekOutOfZone12Fraction: 0.26 })[0]!.title).toBe(
      "Intensité de la semaine",
    );
  });

  it("relaie chaque activité suspecte comme une entrée « valeur à confirmer »", () => {
    const result = detectVigilancePoints({
      ...base,
      suspiciousActivities: [{ id: "a1", day: "2026-09-01", reason: "distance nulle avec durée non nulle" }],
    });
    expect(result[0]!.title).toBe("Valeur à confirmer");
    expect(result[0]!.action).toContain("distance nulle");
  });

  it("n'affiche jamais rien qui mentionne la natation ou le triathlon", () => {
    // Garde structurelle : aucune règle de ce module ne référence ces mots.
    const src = detectVigilancePoints.toString();
    expect(src.toLowerCase()).not.toMatch(/natation|nage|triathlon/);
  });
});
