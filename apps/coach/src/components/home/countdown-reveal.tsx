"use client";

import { useEffect, useState } from "react";

/**
 * LE mouvement principal de l'accueil (section 1.4 du cahier des charges,
 * "une animation remarquable par écran") : le compte à rebours grimpe
 * jusqu'à sa vraie valeur au premier chargement. Volontairement distinct de
 * `<CountUp />`, qui n'anime jamais au montage — ici l'animation EST le
 * point, pas un risque de zéro trompeur : le HTML rendu serveur porte déjà
 * le vrai chiffre, `useEffect` ne fait que le rejouer visuellement à
 * l'hydratation, et `prefers-reduced-motion` saute directement dessus.
 */
export function CountdownReveal({ value, durationMs = 900 }: { value: number; durationMs?: number }) {
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setDisplay(0);
    let frame: number;
    let cancelled = false;
    const start = performance.now();
    const tick = (now: number) => {
      if (cancelled) return;
      const progress = Math.min(1, (now - start) / durationMs);
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(Math.round(value * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <>{display}</>;
}
