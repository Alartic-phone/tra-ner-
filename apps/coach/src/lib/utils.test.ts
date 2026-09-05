import { describe, expect, it } from "vitest";
import {
  distributePercentages,
  fixed,
  formatDistance,
  formatDistanceOrDuration,
  formatDuration,
  formatTimeRange,
} from "./utils.ts";

describe("fixed (virgule française, jamais un point)", () => {
  it("remplace le point de toFixed par une virgule", () => {
    expect(fixed(24.6875, 2)).toBe("24,69");
    expect(fixed(0, 2)).toBe("0,00");
  });

  it("laisse les entiers sans séparateur (decimals=0)", () => {
    expect(fixed(45, 0)).toBe("45");
  });

  it("gère les valeurs négatives (delta de fraîcheur, forme)", () => {
    expect(fixed(-3.5, 1)).toBe("-3,5");
  });
});

describe("formatDistanceOrDuration", () => {
  it("affiche la distance quand elle existe", () => {
    expect(formatDistanceOrDuration(10714, 3459)).toBe(formatDistance(10714));
  });

  it("affiche la durée, jamais « 0 m », pour une activité sans distance (musculation, rameur…)", () => {
    // Cas réel : séances de musculation affichant à tort « 0 m distance ».
    expect(formatDistanceOrDuration(0, 2700)).toBe("45:00");
    expect(formatDistanceOrDuration(0, 2700)).not.toContain("0 m");
  });
});

describe("formatTimeRange (E1 — chrono visé en fourchette)", () => {
  it("référence : affiche « 1 h 03 – 1 h 07 » pour 3780-4020 s", () => {
    expect(formatTimeRange(3780, 4020)).toBe(`${formatDuration(3780)} – ${formatDuration(4020)}`);
    expect(formatTimeRange(3780, 4020)).toBe("1 h 03 – 1 h 07");
  });

  it("affiche une seule valeur quand les deux bornes sont égales (objectif pas encore élargi)", () => {
    expect(formatTimeRange(3840, 3840)).toBe(formatDuration(3840));
    expect(formatTimeRange(3840, 3840)).not.toContain("–");
  });

  it("renvoie null sans borne renseignée, jamais une fourchette inventée", () => {
    expect(formatTimeRange(null, null)).toBeNull();
    expect(formatTimeRange(3780, null)).toBeNull();
    expect(formatTimeRange(null, 4020)).toBeNull();
  });
});

describe("distributePercentages", () => {
  it("fait toujours sommer les pourcentages à 100", () => {
    // Cas du rapport de bug : arrondis indépendants, 21 + 28 + 25 + 25 + 3 = 102.
    const seconds = [252, 336, 300, 300, 36]; // 20,9 % / 27,9 % / 25 % / 25 % / 3 %
    const result = distributePercentages(seconds);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
  });

  it("donne l'arrondi supérieur aux plus gros résidus", () => {
    // Trois parts égales : 33,33 % chacune. La méthode du plus grand reste
    // donne 34/33/33 (ou une permutation équivalente selon l'ordre des
    // résidus), jamais 33/33/33 = 99 ni 34/34/34 = 102.
    const result = distributePercentages([1, 1, 1]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    expect(result.filter((v) => v === 34)).toHaveLength(1);
    expect(result.filter((v) => v === 33)).toHaveLength(2);
  });

  it("renvoie des zéros pour une somme nulle ou négative", () => {
    expect(distributePercentages([0, 0, 0])).toEqual([0, 0, 0]);
    expect(distributePercentages([])).toEqual([]);
  });

  it("laisse une seule valeur à 100", () => {
    expect(distributePercentages([42])).toEqual([100]);
  });

  it("gère un cas déjà exact sans le perturber", () => {
    expect(distributePercentages([25, 25, 25, 25])).toEqual([25, 25, 25, 25]);
  });
});
