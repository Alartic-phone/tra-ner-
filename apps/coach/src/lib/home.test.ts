import { describe, expect, it } from "vitest";
import { buildTodayPhrase, describeTrainingLoad } from "./home.ts";

describe("describeTrainingLoad (carte Charge de l'accueil)", () => {
  it("aucun verdict sur historique indéterminé — jamais un chiffre inventé", () => {
    expect(describeTrainingLoad("indeterminee")).toBeNull();
  });

  it("libellé et teinte pour chacune des quatre zones réelles", () => {
    expect(describeTrainingLoad("sous-charge")).toEqual({ phrase: "Charge · en retrait", tone: "default" });
    expect(describeTrainingLoad("optimale")).toEqual({
      phrase: "Charge · en progression maîtrisée",
      tone: "ok",
    });
    expect(describeTrainingLoad("prudence")).toEqual({ phrase: "Charge · à surveiller", tone: "warn" });
    expect(describeTrainingLoad("alerte")).toEqual({
      phrase: "Charge · progression trop rapide",
      tone: "danger",
    });
  });
});

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
