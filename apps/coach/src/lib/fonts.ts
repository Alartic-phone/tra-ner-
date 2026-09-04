import localFont from "next/font/local";

/**
 * Polices auto-hébergées : les fichiers viennent des paquets npm
 * @fontsource-variable (variable fonts) et sont servis par next/font/local —
 * jamais Google Fonts, jamais de CDN. Le chemin pointe directement dans
 * node_modules : c'est le paquet npm qui fait office de source, pas un
 * dossier de fichiers dupliqués dans le dépôt.
 *
 * Une seule famille pour le display et les titres — Archivo, exploitée sur
 * son axe de largeur (wdth, 62-125) en plus du poids — plutôt qu'une paire de
 * polices sans rapport : plus discipliné, et c'est l'axe de largeur qui donne
 * aux chiffres héros leur caractère (voir .text-hero-number, globals.css).
 * Le fichier "standard" du paquet combine wght ET wdth dans un seul woff2.
 */
export const fontArchivo = localFont({
  src: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  style: "normal",
  display: "swap",
});

/** Tableaux de données : splits, laps, export. */
export const fontJetBrainsMono = localFont({
  src: "../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  style: "normal",
  display: "swap",
});
