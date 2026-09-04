import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { fontArchivo, fontJetBrainsMono } from "@/lib/fonts.ts";
import { cn } from "@/lib/utils.ts";
import { APP_DESCRIPTION, APP_NAME } from "@/lib/app-config.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
  // Application strictement privée : aucune indexation.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#080b12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" className={cn(fontArchivo.variable, fontJetBrainsMono.variable)}>
      <body>{children}</body>
    </html>
  );
}
