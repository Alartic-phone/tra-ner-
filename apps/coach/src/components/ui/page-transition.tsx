"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { TRANSITION } from "@/lib/motion.ts";

/**
 * Fondu + très léger glissement à chaque changement de page — un changement
 * de section parmi tant d'autres, pas l'animation remarquable de l'écran :
 * 150 ms, opacité et 2 px, rien de plus (cf. lib/motion.ts).
 *
 * La structure DOM reste IDENTIQUE que `reduced` soit vrai ou faux — seule
 * la transition change (durée nulle plutôt que 150 ms). Faire dépendre la
 * présence même du `motion.div` de `useReducedMotion()` casserait
 * l'hydratation : le serveur ne connaît jamais la préférence système du
 * client, donc son rendu initial et le premier rendu client diffèrent
 * forcément si la préférence est activée — React régénère alors tout
 * l'arbre au lieu de l'hydrater.
 */
export function PageTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const reduced = useReducedMotion();

  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0, y: 2 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0 }}
        transition={reduced ? { duration: 0 } : TRANSITION.fast}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}
