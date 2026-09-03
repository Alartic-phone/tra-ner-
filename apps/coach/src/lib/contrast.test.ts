import { describe, expect, it } from "vitest";
import {
  compositeOver,
  contrastRatio,
  minVeilAlphaForContrast,
  relativeLuminance,
  worstCaseTextContrast,
} from "./contrast.ts";

const WHITE = { r: 255, g: 255, b: 255 };
const BLACK = { r: 0, g: 0, b: 0 };

describe("relativeLuminance", () => {
  it("blanc = 1, noir = 0", () => {
    expect(relativeLuminance(WHITE)).toBeCloseTo(1, 5);
    expect(relativeLuminance(BLACK)).toBeCloseTo(0, 5);
  });
});

describe("contrastRatio", () => {
  it("noir sur blanc = 21:1", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 1);
  });

  it("une couleur contre elle-même = 1:1", () => {
    expect(contrastRatio({ r: 120, g: 50, b: 200 }, { r: 120, g: 50, b: 200 })).toBeCloseTo(1, 5);
  });

  it("est symétrique", () => {
    const a = { r: 10, g: 200, b: 90 };
    const b = { r: 240, g: 30, b: 10 };
    expect(contrastRatio(a, b)).toBeCloseTo(contrastRatio(b, a), 10);
  });
});

describe("compositeOver", () => {
  it("alpha 1 = la couleur du dessus seule", () => {
    expect(compositeOver({ r: 10, g: 20, b: 30 }, 1, WHITE)).toEqual({ r: 10, g: 20, b: 30 });
  });

  it("alpha 0 = le fond seul", () => {
    expect(compositeOver({ r: 10, g: 20, b: 30 }, 0, WHITE)).toEqual(WHITE);
  });
});

describe("worstCaseTextContrast / minVeilAlphaForContrast", () => {
  // Le voile de la refonte : rgba(8,11,18, alpha) sous du texte --color-text
  // (#f2f5fa), sur le fond le plus défavorable (blanc pur).
  const veil = { r: 8, g: 11, b: 18 };
  const text = { r: 0xf2, g: 0xf5, b: 0xfa };

  it("le contraste augmente avec l'opacité du voile", () => {
    const low = worstCaseTextContrast(text, veil, 0.4);
    const high = worstCaseTextContrast(text, veil, 0.9);
    expect(high).toBeGreaterThan(low);
  });

  it("trouve une opacité minimale qui tient 4.5:1 pour ce voile/texte", () => {
    const alpha = minVeilAlphaForContrast(text, veil, 4.5, 0.5);
    expect(alpha).not.toBeNull();
    expect(worstCaseTextContrast(text, veil, alpha!)).toBeGreaterThanOrEqual(4.5);
  });

  it("renvoie null quand la cible est inatteignable même opaque", () => {
    // Texte quasi identique au voile : même à alpha 1, le contraste reste bas.
    const nearVeilText = { r: 20, g: 20, b: 25 };
    expect(minVeilAlphaForContrast(nearVeilText, veil, 4.5, 0.5)).toBeNull();
  });

  /**
   * Verrou de non-régression pour <PhotoHero /> : DEFAULT_VEIL_ALPHA (0.62,
   * photo-hero.tsx) doit rester suffisant pour --color-text (#f2f5fa) sur
   * rgba(8,11,18). Si ce test casse après un changement de couleur, relever
   * DEFAULT_VEIL_ALPHA plutôt que d'ignorer l'échec.
   */
  it("0.62 suffit pour --color-text sur le voile de production", () => {
    expect(worstCaseTextContrast(text, veil, 0.62)).toBeGreaterThanOrEqual(4.5);
  });
});
