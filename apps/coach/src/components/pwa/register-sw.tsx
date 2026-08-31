"use client";

import { useEffect } from "react";

/**
 * Enregistrement du service worker, uniquement en production : en
 * développement, Next recompile en continu et un cache-first sur les assets
 * servirait des chunks obsolètes, ce qui rend le debug pénible pour un
 * bénéfice nul (le dev n'a pas besoin d'ouverture instantanée hors-ligne).
 */
export function RegisterServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch((error) => {
      console.error("Échec de l'enregistrement du service worker.", error);
    });
  }, []);

  return null;
}
