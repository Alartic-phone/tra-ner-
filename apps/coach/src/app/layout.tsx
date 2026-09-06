import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { fontArchivo, fontJetBrainsMono, fontNewsreader } from "@/lib/fonts.ts";
import { cn } from "@/lib/utils.ts";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-config.ts";
import { resolveTheme } from "@/lib/theme.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
  // Application strictement privée : aucune indexation.
  robots: { index: false, follow: false },
};

/**
 * Couleur de la barre système, alignée sur le thème RÉELLEMENT résolu
 * (cookie explicite, sinon l'heure) — jamais figée sur le sombre par défaut.
 */
export async function generateViewport(): Promise<Viewport> {
  const theme = await resolveTheme();
  return {
    themeColor: theme === "dark" ? "#0e1a17" : "#f4f1ea",
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
  };
}

export default async function RootLayout({ children }: { children: ReactNode }) {
  const theme = await resolveTheme();
  return (
    <html
      lang="fr"
      data-theme={theme}
      className={cn(fontArchivo.variable, fontJetBrainsMono.variable, fontNewsreader.variable)}
    >
      <body>{children}</body>
    </html>
  );
}
