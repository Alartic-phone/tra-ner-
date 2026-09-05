"use client";

import { motion, useReducedMotion } from "framer-motion";
import { formatDayShort } from "@/lib/time.ts";
import { DUR, EASE, STAGGER } from "@/lib/motion.ts";
import { fixed } from "@/lib/utils.ts";
import { barHeightsPct, type RecordPoint } from "./record-staircase-logic.ts";

/**
 * Marches d'escalier des records successifs : une barre par record, hauteur
 * proportionnelle à la valeur, valeur au-dessus, date en dessous. Le dernier
 * record en --color-signal — la seule autre place de l'app où l'ambre
 * apparaît en dehors du ruban de cycle. Au premier affichage, cascade
 * `STAGGER` en `EASE.out` ; `useReducedMotion` l'annule (barres à leur
 * hauteur finale, sans montée).
 */
export function RecordStaircase({
  records,
  unit = "km",
  decimals = 2,
  className,
}: {
  records: readonly RecordPoint[];
  unit?: string;
  decimals?: number;
  className?: string;
}) {
  const reduceMotion = useReducedMotion();
  if (records.length === 0) return null;

  const heights = barHeightsPct(records);
  const lastIndex = records.length - 1;

  return (
    <div className={className}>
      <div className="flex items-end gap-2 sm:gap-3">
        {records.map((r, i) => {
          const isLast = i === lastIndex;
          return (
            <div key={r.day} className="flex min-w-0 flex-1 flex-col items-center">
              <span
                className="tabular mb-1 text-xs font-medium sm:text-sm"
                style={{ color: isLast ? "var(--color-signal)" : "var(--color-text)" }}
              >
                {fixed(r.value, decimals)}
              </span>
              {/* Hauteur du conteneur fixée explicitement : une hauteur en %
                  sur la barre (ci-dessous) ne se résout que contre un parent
                  de hauteur définie, pas contre un parent flex qui s'ajuste à
                  son contenu. */}
              <div className="flex w-full items-end" style={{ height: 160 }}>
                <motion.div
                  className="w-full rounded-t-[3px]"
                  style={{ backgroundColor: isLast ? "var(--color-signal)" : "var(--color-accent)" }}
                  initial={reduceMotion ? false : { height: 0 }}
                  animate={{ height: `${heights[i]}%` }}
                  transition={{ duration: DUR.slow, delay: i * STAGGER, ease: EASE.out }}
                />
              </div>
              <span className="tabular mt-1 text-[10px] text-[var(--color-faint)]">
                {formatDayShort(r.day)}
              </span>
            </div>
          );
        })}
      </div>
      <p className="mt-1 text-center text-[11px] text-[var(--color-faint)]">{unit}</p>
    </div>
  );
}
