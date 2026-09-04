"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Anime un nombre vers sa valeur finale lors des changements. N'anime
 * JAMAIS au montage : partir de 0 afficherait une fausse mesure nulle
 * pendant les ~700 ms précédant l'hydratation React, ce qui est exactement
 * ce que la règle « jamais un zéro silencieux » interdit. Le premier rendu
 * affiche donc directement `value`, et seule une mise à jour ultérieure
 * (ex. clic sur « Recalculer ») déclenche l'animation. Respecte
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
  // La valeur initiale du state est déjà `value`, jamais 0 : le premier
  // rendu SSR affiche donc directement la vraie mesure, sans zéro
  // silencieux le temps de l'hydratation.
  const [display, setDisplay] = useState(value);
  const previousValue = useRef(value);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      // Montage initial : rien à animer, `display` porte déjà `value`.
      isFirstRender.current = false;
      previousValue.current = value;
      return;
    }
    const from = previousValue.current;
    if (value === from) return;
    previousValue.current = value;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
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
      setDisplay(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      // Couvre aussi le faux démontage du Strict Mode (dev), rejoué juste
      // après le premier montage — `cancelAnimationFrame` seul suffirait en
      // production, ce garde-fou évite un `setDisplay` fantôme si jamais un
      // frame était déjà en vol au moment du cleanup.
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [value, durationMs]);

  return <>{display.toFixed(decimals)}</>;
}
