import { describe, expect, it } from "vitest";
import { distributePercentages } from "./utils.ts";

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
