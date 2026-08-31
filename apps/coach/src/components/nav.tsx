"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  Activity,
  CalendarDays,
  Gauge,
  LayoutDashboard,
  LineChart,
  MoreHorizontal,
  NotebookPen,
  Settings,
  Target,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";
import { TRANSITION } from "@/lib/motion.ts";

const LINKS = [
  { href: "/", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/calendrier", label: "Calendrier", icon: CalendarDays },
  { href: "/activites", label: "Activités", icon: Activity },
  { href: "/plan", label: "Mon plan", icon: Target },
  { href: "/journal", label: "Journal", icon: NotebookPen },
  { href: "/simulateur", label: "Simulateur", icon: Gauge },
  { href: "/analyses", label: "Analyses", icon: LineChart },
  { href: "/reglages", label: "Réglages", icon: Settings },
] as const;

/**
 * Cinq onglets pouce-atteignables sur mobile : les quatre plus consultés au
 * quotidien, plus « Plus » qui ouvre le reste. Auparavant la barre tronquait
 * silencieusement à `LINKS.slice(0, 5)` — Simulateur, Analyses et Réglages
 * n'étaient tout simplement pas accessibles depuis le téléphone.
 */
const PRIMARY_HREFS = ["/", "/calendrier", "/plan", "/analyses"];
const PRIMARY_LINKS = LINKS.filter((l) => PRIMARY_HREFS.includes(l.href));
const MORE_LINKS = LINKS.filter((l) => !PRIMARY_HREFS.includes(l.href));

/** Barre inférieure sur mobile (consultation au travail), colonne sur écran large. */
export function AppNav() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const reducedMotion = useReducedMotion();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);
  const moreActive = MORE_LINKS.some((l) => isActive(l.href));

  return (
    <>
      <nav className="hidden w-52 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3 md:block">
        <div className="px-2 pb-4 pt-1 text-sm font-semibold">Coach</div>
        <ul className="space-y-0.5">
          {LINKS.map(({ href, label, icon: Icon }) => {
            const active = isActive(href);
            return (
              <li key={href} className="relative">
                <Link
                  href={href}
                  className={cn(
                    "relative flex items-center gap-2.5 rounded-[var(--radius-card)] px-2 py-1.5 text-sm transition-colors duration-[var(--duration-fast)]",
                    active
                      ? "text-[var(--color-text)]"
                      : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]",
                  )}
                >
                  {active && !reducedMotion ? (
                    <motion.span
                      layoutId="nav-active-pill"
                      className="absolute inset-0 rounded-[var(--radius-card)] bg-[var(--color-accent-soft)]"
                      transition={TRANSITION.base}
                    />
                  ) : active ? (
                    <span className="absolute inset-0 rounded-[var(--radius-card)] bg-[var(--color-accent-soft)]" />
                  ) : null}
                  <Icon size={16} className="relative" aria-hidden />
                  <span className="relative">{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)] md:hidden">
        {PRIMARY_LINKS.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors duration-[var(--duration-fast)]",
              isActive(href) ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]",
            )}
          >
            <Icon size={18} aria-hidden />
            {label.split(" ")[0]}
          </Link>
        ))}
        <button
          type="button"
          aria-label="Plus"
          onClick={() => setMoreOpen(true)}
          className={cn(
            "flex flex-col items-center gap-0.5 py-2 text-[10px] transition-colors duration-[var(--duration-fast)]",
            moreActive ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]",
          )}
        >
          <MoreHorizontal size={18} aria-hidden />
          Plus
        </button>
      </nav>

      {/* Feuille « Plus » : sheet CSS pure, pas de librairie. */}
      {moreOpen ? (
        <div className="fixed inset-0 z-30 md:hidden">
          <button
            type="button"
            aria-label="Fermer"
            className="absolute inset-0 bg-black/50 animate-[fade-in_var(--duration-fast)_var(--ease-standard)]"
            onClick={() => setMoreOpen(false)}
          />
          <div
            className={cn(
              "absolute inset-x-0 bottom-0 rounded-t-[var(--radius-card)] border-t border-[var(--color-border)]",
              "bg-[var(--color-surface)] pb-[calc(env(safe-area-inset-bottom)+0.75rem)] pt-2",
              "animate-[sheet-in_var(--duration-slow)_var(--ease-standard)]",
            )}
          >
            <div className="mx-auto mb-2 h-1 w-9 rounded-[var(--radius-pill)] bg-[var(--color-border-strong)]" />
            <div className="flex items-center justify-between px-4 py-1">
              <span className="text-sm font-medium">Plus</span>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setMoreOpen(false)}
                className="text-[var(--color-muted)]"
              >
                <X size={18} aria-hidden />
              </button>
            </div>
            <ul className="mt-1 grid grid-cols-4 gap-1 px-3 py-2">
              {MORE_LINKS.map(({ href, label, icon: Icon }) => (
                <li key={href}>
                  <Link
                    href={href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-[var(--radius-card)] px-2 py-3 text-center text-[11px] transition-colors duration-[var(--duration-fast)]",
                      isActive(href)
                        ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                        : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]",
                    )}
                  >
                    <Icon size={20} aria-hidden />
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </>
  );
}
