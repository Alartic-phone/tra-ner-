"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { THEME_COOKIE, type ThemePreference } from "@/lib/theme.ts";

const ONE_YEAR_S = 60 * 60 * 24 * 365;

/**
 * Mémorise le thème choisi dans l'en-tête. Cookie, pas `localStorage` : la
 * page est rendue serveur, avant tout script client — un thème mémorisé
 * côté client ne serait appliqué qu'après un flash du mauvais thème.
 */
export async function setThemePreference(preference: ThemePreference): Promise<void> {
  const store = await cookies();
  if (preference === "auto") {
    store.delete(THEME_COOKIE);
  } else {
    store.set(THEME_COOKIE, preference, {
      maxAge: ONE_YEAR_S,
      httpOnly: false,
      sameSite: "lax",
      path: "/",
    });
  }
  revalidatePath("/", "layout");
}
