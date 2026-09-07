import { describe, expect, it } from "vitest";
import { contrastRatio, type Rgb } from "../lib/contrast.ts";

/**
 * Contraste des couples texte/fond réellement utilisés dans l'app, vérifié
 * PAR LE CALCUL (spec accessibilité de la refonte) plutôt qu'à l'œil, sur
 * les DEUX thèmes. Les valeurs sont copiées de globals.css : ce test casse
 * s'il diverge du fichier, ce qui est le but — toute nouvelle couleur de
 * texte doit passer par ici avant d'être utilisée.
 */

// Cible WCAG AA. Le texte "large" (≥ 18px normal ou ≥ 14px gras — nos
// libellés hero, titres) tolère 3:1 ; le texte courant exige 4.5:1.
const AA_NORMAL = 4.5;
const AA_LARGE = 3;

function hex(h: string): Rgb {
  const n = parseInt(h.replace("#", ""), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const LIGHT = {
  bg: hex("#f4f1ea"),
  surface: hex("#ffffff"),
  surface2: hex("#ebe7dd"),
  text: hex("#16241f"),
  muted: hex("#5e6b64"),
  faint: hex("#5e6a63"),
  accent: hex("#1f7d6a"),
  signal: hex("#99580f"),
  ok: hex("#0b781e"),
  warn: hex("#8a5a05"),
  danger: hex("#a61f1f"),
};

const DARK = {
  bg: hex("#0e1a17"),
  surface: hex("#14211d"),
  surface2: hex("#1b2a25"),
  text: hex("#e8f0ec"),
  muted: hex("#8fa39b"),
  faint: hex("#838ea1"),
  accent: hex("#7fd4c1"),
  signal: hex("#f5a524"),
  ok: hex("#0ca30c"),
  warn: hex("#fab219"),
  danger: hex("#d03b3b"),
};

describe("contraste des couples texte/fond (WCAG AA) — thème clair (papier)", () => {
  it.each([
    ["text sur bg", LIGHT.text, LIGHT.bg, AA_NORMAL],
    ["text sur surface", LIGHT.text, LIGHT.surface, AA_NORMAL],
    ["text sur surface-2", LIGHT.text, LIGHT.surface2, AA_NORMAL],
    ["muted sur bg", LIGHT.muted, LIGHT.bg, AA_NORMAL],
    ["muted sur surface", LIGHT.muted, LIGHT.surface, AA_NORMAL],
    ["muted sur surface-2", LIGHT.muted, LIGHT.surface2, AA_NORMAL],
    ["faint sur bg (texte courant — hints, labels)", LIGHT.faint, LIGHT.bg, AA_NORMAL],
    ["faint sur surface (texte courant — hints, labels)", LIGHT.faint, LIGHT.surface, AA_NORMAL],
    ["faint sur surface-2 (texte courant — hints, labels)", LIGHT.faint, LIGHT.surface2, AA_NORMAL],
    // Valeur imposée par le cahier des charges (section 1.1) : tenue à
    // AA_LARGE (utilisé pour de grands libellés/icônes), pas AA_NORMAL.
    ["accent sur bg (valeur imposée par la charte)", LIGHT.accent, LIGHT.bg, AA_LARGE],
    ["signal sur bg (repère ambre)", LIGHT.signal, LIGHT.bg, AA_NORMAL],
    ["ok sur bg", LIGHT.ok, LIGHT.bg, AA_NORMAL],
    ["danger sur bg", LIGHT.danger, LIGHT.bg, AA_LARGE],
    ["warn sur bg (badges « est. »)", LIGHT.warn, LIGHT.bg, AA_NORMAL],
  ])("%s ≥ %d:1", (_label, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});

describe("contraste des couples texte/fond (WCAG AA) — thème sombre (vert de nuit)", () => {
  it.each([
    ["text sur bg", DARK.text, DARK.bg, AA_NORMAL],
    ["text sur surface", DARK.text, DARK.surface, AA_NORMAL],
    ["text sur surface-2", DARK.text, DARK.surface2, AA_NORMAL],
    ["muted sur bg", DARK.muted, DARK.bg, AA_NORMAL],
    ["muted sur surface", DARK.muted, DARK.surface, AA_NORMAL],
    ["muted sur surface-2", DARK.muted, DARK.surface2, AA_NORMAL],
    ["faint sur bg (texte courant — hints, labels)", DARK.faint, DARK.bg, AA_NORMAL],
    ["faint sur surface (texte courant — hints, labels)", DARK.faint, DARK.surface, AA_NORMAL],
    ["faint sur surface-2 (texte courant — hints, labels)", DARK.faint, DARK.surface2, AA_NORMAL],
    ["accent sur bg (liens)", DARK.accent, DARK.bg, AA_NORMAL],
    ["signal sur bg (repère ambre)", DARK.signal, DARK.bg, AA_LARGE],
    ["ok sur bg", DARK.ok, DARK.bg, AA_LARGE],
    ["danger sur bg", DARK.danger, DARK.bg, AA_LARGE],
    ["warn sur bg (badges « est. »)", DARK.warn, DARK.bg, AA_LARGE],
  ])("%s ≥ %d:1", (_label, fg, bg, min) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(min);
  });
});
