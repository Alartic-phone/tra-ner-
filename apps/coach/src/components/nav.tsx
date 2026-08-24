"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  CalendarDays,
  Gauge,
  LayoutDashboard,
  LineChart,
  NotebookPen,
  Settings,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils.ts";

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

/** Barre inférieure sur mobile (consultation au travail), colonne sur écran large. */
export function AppNav() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <>
      <nav className="hidden w-52 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] p-3 md:block">
        <div className="px-2 pb-4 pt-1 text-sm font-semibold">Coach</div>
        <ul className="space-y-0.5">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <li key={href}>
              <Link
                href={href}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm",
                  isActive(href)
                    ? "bg-[var(--color-accent-soft)] text-[var(--color-text)]"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)]",
                )}
              >
                <Icon size={16} aria-hidden />
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-[var(--color-border)] bg-[var(--color-surface)] pb-[env(safe-area-inset-bottom)] md:hidden">
        {LINKS.slice(0, 5).map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-label={label}
            className={cn(
              "flex flex-col items-center gap-0.5 py-2 text-[10px]",
              isActive(href) ? "text-[var(--color-accent)]" : "text-[var(--color-muted)]",
            )}
          >
            <Icon size={18} aria-hidden />
            {label.split(" ")[0]}
          </Link>
        ))}
      </nav>
    </>
  );
}
