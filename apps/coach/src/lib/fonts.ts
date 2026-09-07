import localFont from "next/font/local";

/**
 * Polices auto-hébergées : les fichiers viennent des paquets npm
 * @fontsource-variable (variable fonts) et sont servis par next/font/local —
 * jamais Google Fonts, jamais de CDN. Le chemin pointe directement dans
 * node_modules : c'est le paquet npm qui fait office de source, pas un
 * dossier de fichiers dupliqués dans le dépôt.
 *
 * Trois signatures distinctes, chacune sur un seul rôle (carnet
 * d'entraînement, pas un tableau de bord SaaS) :
 *   - Newsreader (serif) : les TITRES, et seulement eux — c'est elle qui
 *     donne le ton carnet ;
 *   - Archivo (sans) : l'INTERFACE — libellés, texte courant ;
 *   - JetBrains Mono : TOUTES les données chiffrées (distances, allures,
 *     dates, durées, y compris les gros chiffres héros — .text-hero-number
 *     dans globals.css), jamais Archivo pour un nombre.
 */
export const fontNewsreader = localFont({
  src: "../../node_modules/@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2",
  variable: "--font-newsreader",
  weight: "200 800",
  style: "normal",
  display: "swap",
});

export const fontArchivo = localFont({
  src: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-standard-normal.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  style: "normal",
  display: "swap",
});

/** Tableaux de données : splits, laps, export, et tous les chiffres héros. */
export const fontJetBrainsMono = localFont({
  src: "../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  style: "normal",
  display: "swap",
});
