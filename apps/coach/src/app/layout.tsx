import type { ReactNode } from "react";
import type { Metadata, Viewport } from "next";
import { RegisterServiceWorker } from "@/components/pwa/register-sw.tsx";
import "./globals.css";

export const metadata: Metadata = {
  title: "Coach",
  description: "Suivi d'entraînement course à pied, adapté au travail posté",
  manifest: "/manifest.webmanifest",
  applicationName: "Coach",
  appleWebApp: { capable: true, title: "Coach", statusBarStyle: "black-translucent" },
  // Application strictement privée : aucune indexation.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#0b0e14",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
