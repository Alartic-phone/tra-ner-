"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Anime un changement de valeur (ease-out cubique). Respecte
 * `prefers-reduced-motion`.
 *
 * L'état affiché démarre à `value`, jamais à 0 : ce composant est monté par un
 * rendu serveur qui connaît déjà la vraie valeur, et le HTML statique envoyé
 * au client doit la refléter directement. Repartir de 0 fabriquerait un chiffre
 * faux — visible aussi longtemps que l'hydratation JS n'a pas eu lieu — ce que
 * la règle absolue du projet interdit (jamais un zéro qui n'est pas la donnée).
 * L'animation ne s'exécute donc qu'au changement d'une valeur déjà montée
 * (ex. revalidation client), jamais au montage initial.
 */
export function CountUp({
  value,
  durationMs = 700,
  decimals = 0,
}: {
  value: number;
  durationMs?: number;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(value);
  const previousValue = useRef(value);

  useEffect(() => {
    const from = previousValue.current;
    previousValue.current = value;
    if (from === value) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    let frame: number;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / durationMs);
      // Ease-out cubique : rapide au début, se pose en douceur sur la valeur finale.
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs]);

  return <>{display.toFixed(decimals)}</>;
}
