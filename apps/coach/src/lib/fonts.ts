import localFont from "next/font/local";

/**
 * Polices auto-hébergées : les fichiers viennent des paquets npm
 * @fontsource-variable (variable fonts, un seul .woff2 par famille) et sont
 * servis par next/font/local — jamais Google Fonts, jamais de CDN. Le chemin
 * pointe directement dans node_modules : c'est le paquet npm qui fait office
 * de source, pas un dossier de fichiers dupliqués dans le dépôt.
 *
 * Trois paires proposées sur /debug/typo (système de design v2, cf.
 * CLAUDE.md du projet). Aucune n'est appliquée au reste de l'app tant que le
 * choix n'est pas fait : seuls --font-display/--font-body (globals.css)
 * changeront ce jour-là.
 */

export const fontSpaceGrotesk = localFont({
  src: "../../node_modules/@fontsource-variable/space-grotesk/files/space-grotesk-latin-wght-normal.woff2",
  variable: "--font-display-technique",
  weight: "300 700",
  style: "normal",
  display: "swap",
});

export const fontInter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  variable: "--font-body-technique",
  weight: "100 900",
  style: "normal",
  display: "swap",
});

export const fontUnbounded = localFont({
  src: "../../node_modules/@fontsource-variable/unbounded/files/unbounded-latin-wght-normal.woff2",
  variable: "--font-display-impact",
  weight: "200 900",
  style: "normal",
  display: "swap",
});

export const fontManrope = localFont({
  src: "../../node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2",
  variable: "--font-body-impact",
  weight: "200 800",
  style: "normal",
  display: "swap",
});

export const fontOswald = localFont({
  src: "../../node_modules/@fontsource-variable/oswald/files/oswald-latin-wght-normal.woff2",
  variable: "--font-display-endurance",
  weight: "200 700",
  style: "normal",
  display: "swap",
});

export const fontIbmPlexSans = localFont({
  src: "../../node_modules/@fontsource-variable/ibm-plex-sans/files/ibm-plex-sans-latin-wght-normal.woff2",
  variable: "--font-body-endurance",
  weight: "100 700",
  style: "normal",
  display: "swap",
});

export type TypoPair = {
  id: "technique" | "impact" | "endurance";
  name: string;
  blurb: string;
  display: ReturnType<typeof localFont>;
  displayName: string;
  body: ReturnType<typeof localFont>;
  bodyName: string;
};

export const TYPO_PAIRS: TypoPair[] = [
  {
    id: "technique",
    name: "Technique",
    blurb:
      "Le pari sûr : Space Grotesk apporte du caractère géométrique aux gros " +
      "chiffres sans dérailler, Inter est déjà éprouvé à toutes les tailles " +
      "en corps de texte. Le moins risqué des trois.",
    display: fontSpaceGrotesk,
    displayName: "Space Grotesk Variable",
    body: fontInter,
    bodyName: "Inter Variable",
  },
  {
    id: "impact",
    name: "Impact",
    blurb:
      "Le plus proche de Strava/Whoop : Unbounded, dense et confiant, pour " +
      "les hero numbers ; Manrope en corps, rond et chaleureux, pour ne pas " +
      "prolonger la dureté du display dans les listes.",
    display: fontUnbounded,
    displayName: "Unbounded Variable",
    body: fontManrope,
    bodyName: "Manrope Variable",
  },
  {
    id: "endurance",
    name: "Endurance",
    blurb:
      "Condensé façon dossard de course — Oswald empile les chiffres sans " +
      "déborder sur mobile ; IBM Plex Sans en corps, texture technique " +
      "cohérente avec l'esprit data de l'app.",
    display: fontOswald,
    displayName: "Oswald Variable",
    body: fontIbmPlexSans,
    bodyName: "IBM Plex Sans Variable",
  },
];
