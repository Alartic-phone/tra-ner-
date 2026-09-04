"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Anime un nombre de 0 à sa valeur finale au montage. Respecte
 * `prefers-reduced-motion` (pas de RAF, valeur finale affichée directement).
 * Une fois le montage initial passé, un changement de `value` s'affiche
 * directement, sans rejouer le compteur — "jamais au re-render".
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
  const [display, setDisplay] = useState(0);
  // Vrai une fois l'animation de montage terminée (ou sautée). Un ref plutôt
  // qu'un state : ne doit jamais provoquer de re-render à lui seul.
  const completedInitial = useRef(false);
  const lastValue = useRef(value);

  useEffect(() => {
    if (completedInitial.current) {
      // Montage initial déjà joué — un changement de valeur ultérieur
      // s'affiche directement, sans rejouer le compteur.
      if (lastValue.current !== value) {
        lastValue.current = value;
        setDisplay(value);
      }
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      completedInitial.current = true;
      setDisplay(value);
      return;
    }

    let frame: number;
    let cancelled = false;
    const start = performance.now();
    const tick = (now: number) => {
      if (cancelled) return;
      const progress = Math.min(1, (now - start) / durationMs);
      // Ease-out cubique : rapide au début, se pose en douceur sur la valeur finale.
      const eased = 1 - (1 - progress) ** 3;
      setDisplay(value * eased);
      if (progress < 1) {
        frame = requestAnimationFrame(tick);
      } else {
        completedInitial.current = true;
      }
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      // Ce cleanup correspond aussi au faux démontage du Strict Mode (dev),
      // rejoué juste après le premier montage — PAS forcément un vrai
      // démontage. `completedInitial` n'est PAS marqué ici : le prochain
      // passage de l'effet (remontage simulé, ou vrai remontage) doit
      // reprendre l'animation depuis le début plutôt que de rester bloqué
      // sur la valeur interrompue par ce cleanup.
    };
  }, [value, durationMs]);

  return <>{display.toFixed(decimals)}</>;
}
