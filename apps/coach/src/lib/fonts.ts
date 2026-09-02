import localFont from "next/font/local";

/**
 * Polices auto-hébergées : les fichiers viennent des paquets npm
 * @fontsource-variable (variable fonts, un seul .woff2 par famille) et sont
 * servis par next/font/local — jamais Google Fonts, jamais de CDN. Le chemin
 * pointe directement dans node_modules : c'est le paquet npm qui fait office
 * de source, pas un dossier de fichiers dupliqués dans le dépôt.
 *
 * Direction « poste de nuit » : UNE seule famille variable pour toute
 * l'application, exploitée sur son axe de largeur pour les chiffres héros
 * plutôt que d'appairer deux polices sans rapport — plus disciplinée et plus
 * caractéristique. JetBrains Mono ne sert qu'aux tableaux de données (splits,
 * tours, export), jamais au reste de l'interface.
 */

export const fontArchivo = localFont({
  src: "../../node_modules/@fontsource-variable/archivo/files/archivo-latin-wght-normal.woff2",
  variable: "--font-archivo",
  weight: "100 900",
  style: "normal",
  display: "swap",
});

export const fontJetBrainsMono = localFont({
  src: "../../node_modules/@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2",
  variable: "--font-jetbrains-mono",
  weight: "100 800",
  style: "normal",
  display: "swap",
});
