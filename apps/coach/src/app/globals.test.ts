import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * "TOUT chiffre affiché dans l'app porte font-variant-numeric: tabular-nums.
 * Sans exception." (consigne de refonte). Appliqué une fois en règle globale
 * sur `body` plutôt que composant par composant — c'est ce qui la rend
 * garantie "sans exception" — donc ce test protège la ligne globale plutôt
 * que d'inspecter chaque composant qui affiche un chiffre.
 */
describe("globals.css", () => {
  const css = readFileSync(resolve(import.meta.dirname, "./globals.css"), "utf-8");

  it("applique tabular-nums par défaut sur tout le corps de l'app", () => {
    const bodyRule = css.match(/body\s*\{[^}]*\}/)?.[0];
    expect(bodyRule).toBeDefined();
    expect(bodyRule).toContain("font-variant-numeric: tabular-nums");
  });

  it("réserve --color-signal aux quatre usages documentés", () => {
    const comment = css.match(/\/\*\s*\n\s*\* Ambre de lampe à sodium[\s\S]*?\*\//)?.[0];
    expect(comment).toBeDefined();
    expect(comment).toContain("RARE PAR CONSTRUCTION");
  });

  /**
   * `--color-shift-m` valait #f59e0b — quasiment identique visuellement à
   * `--color-signal` (#f5a524), sans qu'aucun code ne référence l'autre :
   * la collision était dans la VALEUR, pas dans un usage croisé, donc
   * invisible à toute recherche de `--color-signal` dans le code. Repéré à
   * l'usage (05/09/2026), pas par la checklist de l'étape 5, qui ne
   * vérifiait que l'absence de référence croisée. Ce test compare les
   * valeurs RGB, pas les noms de variables.
   */
  it("aucune couleur de poste (--color-shift-*) ne se confond visuellement avec --color-signal", () => {
    function hexOf(varName: string): [number, number, number] {
      const hex = css.match(new RegExp(`${varName}:\\s*#([0-9a-fA-F]{6})`))?.[1];
      expect(hex, `${varName} introuvable`).toBeDefined();
      const n = parseInt(hex!, 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    const signal = hexOf("--color-signal");
    for (const shiftVar of ["--color-shift-m", "--color-shift-a", "--color-shift-n"]) {
      const [r, g, b] = hexOf(shiftVar);
      const distance = Math.sqrt((r - signal[0]) ** 2 + (g - signal[1]) ** 2 + (b - signal[2]) ** 2);
      expect(distance, `${shiftVar} trop proche de --color-signal`).toBeGreaterThan(60);
    }
  });
});
