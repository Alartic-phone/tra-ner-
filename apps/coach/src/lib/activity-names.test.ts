import { describe, expect, it } from "vitest";
import { isGenericActivityName, normalizeActivityName } from "./activity-names.ts";

describe("normalisation des noms d'activité génériques", () => {
  it("référence : reconnaît les libellés génériques anglais et français signalés", () => {
    expect(isGenericActivityName("Evening Ride", "Ride")).toBe(true);
    expect(isGenericActivityName("Morning run", "Run")).toBe(true);
    expect(isGenericActivityName("Course à pied en soirée", "Run")).toBe(true);
  });

  it("retraduit un nom générique anglais vers un libellé français dérivé de l'heure", () => {
    expect(normalizeActivityName("Evening Ride", "Ride", 19)).toBe("Sortie vélo du soir");
    expect(normalizeActivityName("Morning run", "Run", 7)).toBe("Course à pied du matin");
  });

  it("ne retraduit pas un nom déjà générique en français : il reste équivalent", () => {
    expect(normalizeActivityName("Course à pied en soirée", "Run", 19)).toBe(
      "Course à pied du soir",
    );
  });

  it("conserve un nom personnalisé tel quel, jamais touché", () => {
    expect(normalizeActivityName("Test de seuil", "Run", 8)).toBe("Test de seuil");
    expect(normalizeActivityName("Reprise", "Run", 18)).toBe("Reprise");
    expect(isGenericActivityName("Test de seuil", "Run")).toBe(false);
  });

  it("est insensible à la casse", () => {
    expect(isGenericActivityName("evening ride", "Ride")).toBe(true);
    expect(isGenericActivityName("MORNING RUN", "Run")).toBe(true);
  });

  it("ne devine rien pour un type d'activité inconnu", () => {
    expect(normalizeActivityName("Evening Something", "UnknownSport", 19)).toBe(
      "Evening Something",
    );
  });

  it("référence : reconnaît un sous-type (trail) même quand type='Run'", () => {
    // Activity.type reste "Run" pour un trail (le détail est dans sportType),
    // mais Strava génère quand même « Morning Trail Run » — observé dans les
    // données réelles, resté « custom » avant ce correctif.
    expect(isGenericActivityName("Morning Trail Run", "Run")).toBe(true);
    expect(normalizeActivityName("Morning Trail Run", "Run", 8)).toBe("Trail du matin");
  });

  it("reconnaît les variantes françaises réellement observées (Entraînement aux poids, le midi…)", () => {
    expect(normalizeActivityName("Entraînement aux poids en soirée", "WeightTraining", 20)).toBe(
      "Musculation du soir",
    );
    expect(normalizeActivityName("Sortie vélo le midi", "Ride", 13)).toBe(
      "Sortie vélo de la mi-journée",
    );
    expect(normalizeActivityName("Lunch Run", "Run", 12)).toBe("Course à pied de la mi-journée");
  });

  it("dérive le bon créneau horaire français à chaque borne", () => {
    expect(normalizeActivityName("Morning Run", "Run", 5)).toBe("Course à pied de nuit");
    expect(normalizeActivityName("Morning Run", "Run", 6)).toBe("Course à pied du matin");
    expect(normalizeActivityName("Morning Run", "Run", 11)).toBe("Course à pied du matin");
    expect(normalizeActivityName("Morning Run", "Run", 12)).toBe("Course à pied de la mi-journée");
    expect(normalizeActivityName("Morning Run", "Run", 14)).toBe("Course à pied de l'après-midi");
    expect(normalizeActivityName("Morning Run", "Run", 18)).toBe("Course à pied du soir");
    expect(normalizeActivityName("Morning Run", "Run", 21)).toBe("Course à pied de nuit");
  });
});
