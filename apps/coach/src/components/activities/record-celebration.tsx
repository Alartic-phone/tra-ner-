"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Trophy } from "lucide-react";
import { formatDuration } from "@/lib/utils.ts";

/**
 * Le seul effet volontairement spectaculaire de l'application, réservé au
 * bris de record — tout le reste reste sobre pour que celui-ci se remarque.
 * Se joue une fois au montage, jamais en boucle. `useReducedMotion` retombe
 * sur l'apparition statique des badges, sans le flash ni le rebond.
 */
export function RecordCelebration({ durations }: { durations: number[] }) {
  const reduced = useReducedMotion();

  if (durations.length === 0) return null;

  if (reduced) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-[var(--color-muted)]">Records personnels :</span>
        {durations.map((d) => (
          <RecordBadge key={d} durationS={d} />
        ))}
      </div>
    );
  }

  return (
    <div className="relative mt-3 flex flex-wrap items-center gap-2">
      <motion.span
        className="pointer-events-none absolute -left-2 -top-2 h-10 w-10 rounded-full bg-[var(--color-warn)]"
        initial={{ opacity: 0.5, scale: 0 }}
        animate={{ opacity: 0, scale: 3 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      />
      <motion.span
        className="text-xs font-medium text-[var(--color-muted)]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.3 }}
      >
        Records personnels :
      </motion.span>
      {durations.map((d, i) => (
        <motion.span
          key={d}
          initial={{ opacity: 0, scale: 0.4, y: -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{
            delay: 0.1 + i * 0.08,
            type: "spring",
            stiffness: 420,
            damping: 14,
          }}
        >
          <RecordBadge durationS={d} />
        </motion.span>
      ))}
    </div>
  );
}

function RecordBadge({ durationS }: { durationS: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-[var(--radius-pill)] border border-[var(--color-warn)]/40 bg-[var(--color-warn)]/10 px-2 py-0.5 text-[11px] font-medium text-[var(--color-warn)]">
      <Trophy size={12} aria-hidden />
      {formatDuration(durationS)}
    </span>
  );
}
