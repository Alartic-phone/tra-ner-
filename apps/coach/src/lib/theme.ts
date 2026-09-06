import { cookies } from "next/headers";
import { currentHour } from "./time.ts";

/**
 * Deux thèmes, jamais un seul : sombre (vert de nuit) de 20 h à 8 h, clair
 * (papier) de 8 h à 20 h — l'application se consulte aussi bien à 5 h du
 * matin avant un poste qu'en plein jour. La bascule automatique se calcule
 * ICI, côté serveur, à partir de l'heure Europe/Paris ; un choix explicite
 * de l'utilisateur (bouton dans l'en-tête) prime toujours sur l'automatique
 * et est mémorisé dans un cookie — jamais `localStorage`, qui ne fonctionne
 * pas pour un rendu décidé côté serveur avant tout script client.
 */
export type Theme = "dark" | "light";
export type ThemePreference = Theme | "auto";

export const THEME_COOKIE = "theme";

/** Sombre de 20 h à 8 h, clair de 8 h à 20 h — bornes du cahier des charges. */
export function autoThemeForHour(hour: number): Theme {
  return hour >= 20 || hour < 8 ? "dark" : "light";
}

function isTheme(value: string | undefined): value is Theme {
  return value === "dark" || value === "light";
}

/** Préférence mémorisée : un thème explicite, ou "auto" (défaut, rien en cookie). */
export async function getThemePreference(): Promise<ThemePreference> {
  const store = await cookies();
  const raw = store.get(THEME_COOKIE)?.value;
  return isTheme(raw) ? raw : "auto";
}

/** Thème RÉELLEMENT appliqué : la préférence si explicite, sinon l'heure du jour. */
export async function resolveTheme(): Promise<Theme> {
  const preference = await getThemePreference();
  return preference === "auto" ? autoThemeForHour(currentHour()) : preference;
}
