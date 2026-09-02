"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Anime un nombre de 0 à sa valeur finale au montage. Respecte
 * `prefers-reduced-motion` (pas de RAF, valeur finale affichée directement).
 */
export function CountUp({
  value,
  durationMs = 700,
  decimals = 0,
  delayMs = 0,
}: {
  value: number;
  durationMs?: number;
  decimals?: number;
  /** Décalage de départ, pour une cascade entre plusieurs chiffres héros du même écran. */
  delayMs?: number;
}) {
  const [display, setDisplay] = useState(0);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    let frame: number;
    let timeout: ReturnType<typeof setTimeout>;
    const run = () => {
      const start = performance.now();
      const tick = (now: number) => {
        const progress = Math.min(1, (now - start) / durationMs);
        // Ease-out cubique : rapide au début, se pose en douceur sur la valeur finale.
        const eased = 1 - (1 - progress) ** 3;
        setDisplay(value * eased);
        if (progress < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    };
    timeout = setTimeout(run, delayMs);
    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(frame);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return <>{display.toFixed(decimals)}</>;
}
