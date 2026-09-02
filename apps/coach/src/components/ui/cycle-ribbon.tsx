import { prisma } from "@/lib/db.ts";
import { getAvailabilityRules } from "@/lib/settings.ts";
import { loadShiftRange } from "@/lib/shifts/repository.ts";
import { addDays } from "@/lib/shifts/day.ts";
import { today } from "@/lib/time.ts";
import { CycleRibbonBar, type RibbonDay } from "./cycle-ribbon-bar.tsx";

/**
 * L'élément signature de l'interface : 21 jours glissants (7 passés,
 * aujourd'hui, 13 à venir — réduits à 14 sur mobile par le composant
 * client), le cycle de postes en couleur, un point par activité réalisée,
 * un cercle vide par séance prévue non faite. Répond en un coup d'œil à
 * « où j'en suis dans mon cycle et quand je peux courir ».
 *
 * Composant serveur : charge les données une fois, les transmet à
 * `CycleRibbonBar` (client) pour le survol et la bascule mobile — c'est la
 * seule partie qui a besoin de JS.
 */

const PAST_DAYS = 7;
const FUTURE_DAYS = 13;

const CODE_COLOR_VARS: Record<string, string> = {
  M: "var(--color-shift-m)",
  A: "var(--color-shift-a)",
  N: "var(--color-shift-n)",
};

export async function CycleRibbon() {
  const now = today();
  const from = addDays(now, -PAST_DAYS);
  const to = addDays(now, FUTURE_DAYS);

  const rules = await getAvailabilityRules();
  const [shiftRange, activityDays, plannedDays] = await Promise.all([
    loadShiftRange(from, to, rules),
    prisma.activity.findMany({
      where: { startDay: { gte: from, lte: to } },
      select: { startDay: true },
      distinct: ["startDay"],
    }),
    prisma.plannedWorkout.findMany({
      where: { day: { gte: from, lte: to }, plan: { status: "active" }, status: "upcoming" },
      select: { day: true },
    }),
  ]);

  const activitySet = new Set(activityDays.map((a) => a.startDay));
  const plannedSet = new Set(plannedDays.map((w) => w.day));
  const timingByCode = new Map(shiftRange.timings.map((t) => [t.code, t]));

  const days: RibbonDay[] = shiftRange.days.map((d) => {
    const timing = d.code ? timingByCode.get(d.code) : undefined;
    const availability = shiftRange.byDay.get(d.day)?.availability;
    const windowsSummary =
      availability && availability.windows.length > 0
        ? availability.windows.map((w) => `${minutes(w.startMin)}–${minutes(w.endMin)}`).join(", ")
        : null;

    return {
      day: d.day,
      code: d.code,
      colorVar: d.code
        ? (CODE_COLOR_VARS[d.code] ?? timing?.color ?? "var(--color-border-strong)")
        : "var(--color-rest)",
      label: timing?.label ?? "Repos",
      windowsSummary,
      hasActivity: activitySet.has(d.day),
      isPlanned: plannedSet.has(d.day),
      isToday: d.day === now,
    };
  });

  return <CycleRibbonBar days={days} />;
}

function minutes(m: number): string {
  const norm = ((m % 1440) + 1440) % 1440;
  const h = Math.floor(norm / 60);
  const mm = norm % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
