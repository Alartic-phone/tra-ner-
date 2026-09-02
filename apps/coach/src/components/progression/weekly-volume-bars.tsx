"use client";

import { motion, useReducedMotion } from "framer-motion";
import { DURATION, EASE } from "@/lib/motion.ts";
import { formatDayShort } from "@/lib/time.ts";

export type WeekVolume = { weekStart: string; km: number };

/**
 * L'animation remarquable de cet écran : les barres montent depuis la base
 * au premier affichage, une fois. `useReducedMotion` les affiche déjà à
 * leur hauteur finale plutôt que de supprimer juste la transition — sans
 * ça, la mise en page sauterait au premier rendu.
 */
export function WeeklyVolumeBars({ weeks }: { weeks: WeekVolume[] }) {
  const reduced = useReducedMotion();
  const max = Math.max(1, ...weeks.map((w) => w.km));

  return (
    <div className="flex h-40 items-end gap-2">
      {weeks.map((w, i) => (
        <div key={w.weekStart} className="flex flex-1 flex-col items-center gap-1">
          <span className="tabular text-[10px] text-[var(--color-faint)]">
            {w.km > 0 ? w.km.toFixed(0) : ""}
          </span>
          <div className="flex h-28 w-full items-end overflow-hidden rounded-t-[3px] bg-[var(--color-surface-2)]">
            <motion.div
              className="w-full rounded-t-[3px] bg-[var(--chart-1)]"
              initial={reduced ? false : { height: 0 }}
              animate={{ height: `${Math.max(2, (w.km / max) * 100)}%` }}
              transition={{ duration: DURATION.slow, ease: EASE.standard, delay: reduced ? 0 : i * 0.03 }}
            />
          </div>
          <span className="text-[9px] text-[var(--color-faint)]">{formatDayShort(w.weekStart)}</span>
        </div>
      ))}
    </div>
  );
}
