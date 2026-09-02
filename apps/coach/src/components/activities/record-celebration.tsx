"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Trophy } from "lucide-react";
import { formatDuration } from "@/lib/utils.ts";
import { TRANSITION } from "@/lib/motion.ts";

/**
 * Le seul effet volontairement spectaculaire de l'application, réservé au
 * bris de record — tout le reste reste sobre pour que celui-ci se remarque.
 * Se joue une fois au montage, jamais en boucle.
 *
 * La structure DOM reste IDENTIQUE que `reduced` soit vrai ou faux — seuls
 * les props `initial`/`transition` changent (`initial={false}` = pas
 * d'animation d'entrée, apparition directe à l'état final). Brancher sur
 * deux arbres JSX différents casserait l'hydratation : le serveur ne
 * connaît jamais la préférence système du client.
 */
export function RecordCelebration({ durations }: { durations: number[] }) {
  const reduced = useReducedMotion();

  if (durations.length === 0) return null;

  return (
    <div className="relative mt-3 flex flex-wrap items-center gap-2">
      <motion.span
        className="pointer-events-none absolute -left-2 -top-2 h-10 w-10 rounded-full bg-[var(--color-signal)]"
        initial={reduced ? false : { opacity: 0.5, scale: 0 }}
        animate={{ opacity: 0, scale: reduced ? 0 : 3 }}
        transition={{ duration: reduced ? 0 : 0.7, ease: "easeOut" }}
      />
      <motion.span
        className="text-xs font-medium text-[var(--color-muted)]"
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: reduced ? 0 : 0.15, duration: reduced ? 0 : 0.3 }}
      >
        Records personnels :
      </motion.span>
      {durations.map((d, i) => (
        <motion.span
          key={d}
          initial={reduced ? false : { opacity: 0, scale: 0.4, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={reduced ? { duration: 0 } : { ...TRANSITION.record, delay: 0.1 + i * 0.08 }}
        >
          <RecordBadge durationS={d} />
        </motion.span>
      ))}
    </div>
  );
}

function RecordBadge({ durationS }: { durationS: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-signal)]/40 bg-[var(--color-signal-soft)] px-2 py-0.5 text-[11px] font-medium text-[var(--color-signal)]">
      <Trophy size={12} aria-hidden />
      {formatDuration(durationS)}
    </span>
  );
}
