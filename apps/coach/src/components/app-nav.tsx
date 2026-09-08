"use client";

import { useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Calculator,
  CalendarDays,
  ClipboardList,
  MoreHorizontal,
  Settings,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

type NavItem = { href: string; label: string; icon: LucideIcon };

// Plan reste toujours visible en direct (page centrale du site, cf. cahier
// des charges §2.1) : seuls les trois liens les moins consultés une fois
// l'état initial dépassé (constat de l'audit fonctionnel du 07/09/2026, déjà
// documenté dans AppHeader) passent dans le menu « Plus » à 390 px.
const DIRECT_ITEMS: NavItem[] = [
  { href: "/plan", label: "Plan", icon: ClipboardList },
  { href: "/activites", label: "Activités", icon: Activity },
  { href: "/calendrier", label: "Calendrier", icon: CalendarDays },
];

const OVERFLOW_ITEMS: NavItem[] = [
  { href: "/progression", label: "Progression", icon: TrendingUp },
  { href: "/simulateur", label: "Simulateur", icon: Calculator },
  { href: "/reglages", label: "Réglages", icon: Settings },
];

function isActive(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

function NavIconLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-7 w-7 items-center justify-center rounded-full transition-colors duration-[var(--duration-fast)]",
        active
          ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
          : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
      )}
    >
      <Icon size={16} aria-hidden />
    </Link>
  );
}

/**
 * Icônes de navigation de l'en-tête : Plan, Activités et Calendrier restent
 * toujours visibles en direct ; Progression, Simulateur et Réglages passent
 * dans un menu « Plus » (`<details>` natif — pas de dépendance Radix,
 * cf. apps/coach/CLAUDE.md) pour que l'en-tête reste lisible à 390 px sans
 * jamais reléguer Plan dans ce menu.
 */
export function AppNav() {
  const pathname = usePathname();
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const overflowActive = OVERFLOW_ITEMS.some((item) => isActive(pathname, item.href));

  return (
    <nav className="flex shrink-0 items-center gap-1 sm:gap-2" aria-label="Navigation principale">
      {DIRECT_ITEMS.map((item) => (
        <NavIconLink key={item.href} item={item} active={isActive(pathname, item.href)} />
      ))}

      <details ref={detailsRef} className="relative">
        <summary
          aria-label="Plus"
          className={cn(
            "flex h-7 w-7 cursor-pointer list-none items-center justify-center rounded-full transition-colors duration-[var(--duration-fast)] [&::-webkit-details-marker]:hidden",
            overflowActive
              ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
          )}
        >
          <MoreHorizontal size={16} aria-hidden />
        </summary>
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-44 rounded-lg border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-1 shadow-lg"
        >
          {OVERFLOW_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(pathname, item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                role="menuitem"
                aria-current={active ? "page" : undefined}
                onClick={() => {
                  if (detailsRef.current) detailsRef.current.open = false;
                }}
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-xs transition-colors duration-[var(--duration-fast)]",
                  active
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]",
                )}
              >
                <Icon size={14} aria-hidden />
                {item.label}
              </Link>
            );
          })}
        </div>
      </details>
    </nav>
  );
}
