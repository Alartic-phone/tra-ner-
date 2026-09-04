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
});
