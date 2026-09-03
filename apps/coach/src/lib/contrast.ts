/**
 * Contraste WCAG 2.x — calculé, jamais estimé à l'œil (CLAUDE.md, section
 * accessibilité de la refonte). Sert à vérifier/choisir le voile de
 * <PhotoHero /> : le texte le plus clair posé dessus doit rester ≥ 4,5:1.
 */

export type Rgb = { r: number; g: number; b: number };

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

/** Luminance relative WCAG (https://www.w3.org/TR/WCAG21/#dfn-relative-luminance). */
export function relativeLuminance({ r, g, b }: Rgb): number {
  return 0.2126 * srgbToLinear(r) + 0.7152 * srgbToLinear(g) + 0.0722 * srgbToLinear(b);
}

/** Ratio de contraste WCAG entre deux couleurs opaques, dans [1, 21]. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const l1 = relativeLuminance(a);
  const l2 = relativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Aplatit une couleur `fg` posée à l'opacité `alpha` sur un fond `bg` — c'est
 * la couleur RÉELLEMENT vue à l'écran (compositing alpha standard), pas
 * `fg` seule. Utilisé pour aplatir le voile sombre sur la photo derrière.
 */
export function compositeOver(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return {
    r: fg.r * alpha + bg.r * (1 - alpha),
    g: fg.g * alpha + bg.g * (1 - alpha),
    b: fg.b * alpha + bg.b * (1 - alpha),
  };
}

/**
 * Contraste texte/photo une fois le voile posé, dans le pire cas plausible :
 * une photo peut contenir des zones aussi claires que blanc pur derrière le
 * texte. Composite `veilColor`+`veilAlpha` par-dessus blanc, puis calcule le
 * contraste avec `textColor`. Si CE contraste tient 4,5:1, il tient partout
 * ailleurs sur la photo (tout est plus sombre que blanc).
 */
export function worstCaseTextContrast(
  textColor: Rgb,
  veilColor: Rgb,
  veilAlpha: number,
): number {
  const worstBackground: Rgb = { r: 255, g: 255, b: 255 };
  const composited = compositeOver(veilColor, veilAlpha, worstBackground);
  return contrastRatio(textColor, composited);
}

/**
 * Opacité de voile minimale (entre `minAlpha` et 1) pour tenir `targetRatio`
 * dans le pire cas. `null` si même une opacité de 1 ne suffit pas (texte trop
 * proche de la couleur du voile) — jamais un voile silencieusement
 * insuffisant.
 */
export function minVeilAlphaForContrast(
  textColor: Rgb,
  veilColor: Rgb,
  targetRatio: number,
  minAlpha: number,
): number | null {
  if (worstCaseTextContrast(textColor, veilColor, 1) < targetRatio) return null;
  // Recherche par pas fins : l'espace est monotone (plus opaque = plus de
  // contraste), une bissection serait plus rapide mais moins lisible ici et
  // le coût est négligeable (101 évaluations, appelé au build/debug, pas au
  // rendu).
  for (let alpha = minAlpha; alpha <= 1; alpha += 0.01) {
    if (worstCaseTextContrast(textColor, veilColor, alpha) >= targetRatio) {
      return Math.round(alpha * 100) / 100;
    }
  }
  return 1;
}
