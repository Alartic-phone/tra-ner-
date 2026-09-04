import { describe, expect, it } from "vitest";
import { contrastRatio, type Rgb } from "../lib/contrast.ts";

/**
 * Contraste des couples texte/fond réellement utilisés dans l'app, vérifié
 * PAR LE CALCUL (spec accessibilité de la refonte) plutôt qu'à l'œil. Les
 * valeurs sont copiées de globals.css : ce test casse s'il diverge du
 * fichier, ce qui est le but — toute nouvelle couleur de texte doit passer
 * par ici avant d'être utilisée.
 */

// Cible WCAG AA. Le texte "large" (≥ 18px normal ou ≥ 14px gras — nos
// libellés hero, titres) tolère 3:1 ; le texte courant exige 4.5:1.
const AA_NORMAL = 4.5;
const AA_LARGE = 3;

function hex(h: string): Rgb {
  const n = parseInt(h.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const COLORS = {
  bg: hex("#080b12"),
  surface: hex("#101623"),
  surface2: hex("#18202f"),
  text: hex("#f2f5fa"),
  muted: hex("#8f9bb0"),
  faint: hex("#6b7789"),
  accent: hex("#5b9cf6"),
  signal: hex("#f5a524"),
  ok: hex("#0ca30c"),
  warn: hex("#fab219"),
  danger: hex("#d03b3b"),
};

describe("contraste des couples texte/fond (WCAG AA)", () => {
  it.each([
    ["text sur bg", COLORS.text, COLORS.bg, AA_NORMAL],
    ["text sur surface", COLORS.text, COLORS.surface, AA_NORMAL],
    ["text sur surface-2", COLORS.text, COLORS.surface2, AA_NORMAL],
    ["muted sur bg", COLORS.muted, COLORS.bg, AA_NORMAL],
    ["muted sur surface", COLORS.muted, COLORS.surface, AA_NORMAL],
    ["faint sur bg (texte large uniquement — labels courts)", COLORS.faint, COLORS.bg, AA_LARGE],
    ["accent sur bg (liens)", COLORS.accent, COLORS.bg, AA_NORMAL],
    ["signal sur bg (repère ambre)", COLORS.signal, COLORS.bg, AA_LARGE],
    ["ok sur bg", COLORS.ok, COLORS.bg, AA_LARGE],
    ["danger sur bg", COLORS.danger, COLORS.bg, AA_LARGE],
    ["warn sur bg (badges « est. »)", COLORS.warn, COLORS.bg, AA_LARGE],
  ])("%s ≥ %d:1", (_label, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});
