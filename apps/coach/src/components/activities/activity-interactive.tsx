"use client";

import { useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { RouteMap } from "@/components/activities/route-map.tsx";
import type { ChartPoint } from "@/lib/streams.ts";
import type { HeartRateZone } from "@/lib/metrics/zones.ts";

// Recharts pèse à lui seul plus que le reste de la page : chargé à la
// demande, jamais dans le lot JS initial (cible : aucune page au-dessus de
// 200 ko). `ssr: false` est sans coût ici, ces graphiques ont de toute façon
// besoin d'une mesure côté client (ResponsiveContainer).
const ActivityCharts = dynamic(
  () => import("@/components/activities/activity-charts.tsx").then((m) => m.ActivityCharts),
  {
    ssr: false,
    loading: () => <div className="h-[840px] w-full animate-pulse rounded-lg bg-[var(--color-surface-2)]" />,
  },
);

/**
 * Frontière client unique pour tout ce qui partage le curseur de survol :
 * le héros (carte) et les quatre graphiques. Tout ce qui n'a pas besoin de
 * cet état (bandeau de chiffres, zones FC, splits…) reste rendu côté
 * serveur et passe simplement en `children`, inséré entre les deux.
 */
export function ActivityInteractive({
  latlng,
  mapTilerKey,
  heroOverlay,
  points,
  hasHr,
  hrZones,
  children,
}: {
  latlng: ReadonlyArray<[number, number] | null>;
  mapTilerKey?: string;
  heroOverlay: ReactNode;
  points: ChartPoint[];
  hasHr: boolean;
  hrZones?: HeartRateZone[] | null;
  children?: ReactNode;
}) {
  const [hover, setHover] = useState<ChartPoint | null>(null);

  return (
    <>
      {latlng.some((p) => p != null) ? (
        <div className="relative h-[30vh] w-full overflow-hidden rounded-[var(--radius-card)] bg-[var(--color-surface)] md:h-[45vh]">
          <RouteMap
            latlng={latlng}
            mapTilerKey={mapTilerKey}
            fill
            drawMs={1200}
            showMarkers
            highlight={hover?.latlng ?? null}
            className="absolute inset-0"
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24"
            style={{ backgroundImage: "linear-gradient(to top, var(--color-bg) 0%, transparent 100%)" }}
          />
          <div className="absolute inset-x-0 bottom-0 p-4 md:p-5">{heroOverlay}</div>
        </div>
      ) : (
        <div className="rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:p-5">
          {heroOverlay}
        </div>
      )}

      {children}

      {points.length > 0 ? (
        <section className="mt-4 rounded-[var(--radius-card)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <h2 className="mb-3 text-sm font-medium">Graphiques</h2>
          <ActivityCharts points={points} hasHr={hasHr} hrZones={hrZones} onHover={setHover} />
        </section>
      ) : null}
    </>
  );
}
