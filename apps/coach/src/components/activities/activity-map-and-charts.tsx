"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { RouteMap } from "./route-map.tsx";
import { ChartSkeleton } from "@/components/ui/chart-skeleton.tsx";
import type { ChartPoint } from "@/lib/streams.ts";
import type { HeartRateZone } from "@/lib/metrics/zones.ts";

// Recharts (~90 Ko gzippé) en import dynamique : pas dans le bundle initial
// de la page activité, seulement une fois qu'on sait qu'il y a des flux à
// tracer. `ssr:false` : la page reste rapide au premier rendu serveur, les
// graphiques apparaissent au montage client, remplaçant un squelette aux
// dimensions exactes (jamais de saut de mise en page).
const ActivityCharts = dynamic(() => import("./activity-charts.tsx").then((m) => m.ActivityCharts), {
  ssr: false,
  loading: () => (
    <div className="space-y-5">
      <ChartSkeleton height={160} />
      <ChartSkeleton height={160} />
      <ChartSkeleton height={160} />
    </div>
  ),
});

/**
 * Un seul curseur synchronisé entre les quatre graphiques ET la carte
 * (CLAUDE.md, page activité §g) : l'index survolé dans un graphique
 * (Recharts, `syncId` pour synchroniser les graphiques entre eux) pilote
 * aussi un marqueur sur la carte, que Recharts ignore complètement — d'où ce
 * wrapper client qui porte l'état partagé.
 */
export function ActivityMapAndCharts({
  latlng,
  mapTilerKey,
  points,
  hasHr,
  hrZones,
}: {
  latlng: ReadonlyArray<[number, number] | null>;
  mapTilerKey?: string;
  points: ChartPoint[];
  hasHr: boolean;
  hrZones?: HeartRateZone[] | null;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const activeLatLng = hoverIndex != null ? (points[hoverIndex]?.latLng ?? null) : null;

  return (
    <div>
      {latlng.some((p) => p != null) ? (
        // La hauteur (30vh mobile / 45vh desktop) vit sur CE conteneur, pas
        // sur RouteMap : `fillParent` fait remplir 100 %/100 % à la carte,
        // un style inline qui gagnerait sur toute classe de hauteur posée
        // directement sur son propre élément.
        <div className="sticky top-0 z-10 h-[30vh] w-full sm:h-[45vh]">
          <RouteMap
            latlng={latlng}
            mapTilerKey={mapTilerKey}
            width={1600}
            height={900}
            fillParent
            activeLatLng={activeLatLng}
          />
        </div>
      ) : null}
      <div className="mt-4 -mx-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
        <div className="min-w-[560px] sm:min-w-0">
          <ActivityCharts points={points} hasHr={hasHr} hrZones={hrZones} onHoverIndex={setHoverIndex} />
        </div>
      </div>
    </div>
  );
}
