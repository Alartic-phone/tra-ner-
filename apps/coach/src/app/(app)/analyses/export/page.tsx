import { prisma } from "@/lib/db.ts";
import { AnalysesTabs } from "@/components/analytics/analyses-tabs.tsx";
import { ExportForm } from "@/components/export/export-form.tsx";
import { addDays } from "@/lib/shifts/day.ts";
import { today } from "@/lib/time.ts";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  // Candidats à la sélection de flux seconde par seconde : les 200 dernières
  // activités de course avec flux, les plus susceptibles d'être choisies
  // "marquantes". Le formulaire ne charge jamais la liste complète.
  const candidates = await prisma.activity.findMany({
    where: { startDay: { gte: addDays(today(), -365) }, hasStreams: true },
    orderBy: { startedAt: "desc" },
    take: 200,
    select: { id: true, name: true, startDay: true, distanceM: true },
  });

  return (
    <div className="p-4 md:p-6">
      <header>
        <h1 className="text-lg font-semibold">Analyses</h1>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Charge, forme et répartition d&apos;intensité.
        </p>
      </header>

      <AnalysesTabs active="export" />

      <div className="mt-4">
        <ExportForm streamCandidates={candidates} />
      </div>
    </div>
  );
}
