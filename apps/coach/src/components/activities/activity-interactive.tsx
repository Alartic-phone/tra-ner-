"use client";

import { useState, type ReactNode } from "react";
import { Card, CardBody, CardHeader } from "@/components/ui/card.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { ActivityHero } from "@/components/activities/activity-hero.tsx";
import { ActivityCharts } from "@/components/activities/activity-charts.tsx";
import { LapRowsTable, type LapRow } from "@/components/activities/lap-rows-table.tsx";
import type { MapSelection } from "@/components/activities/route-map.tsx";
import type { ChartPoint, GeoPoint } from "@/lib/streams.ts";
import type { HeartRateZone } from "@/lib/metrics/zones.ts";

/**
 * Orchestre le curseur et la sélection partagés entre la carte héro, les 4
 * graphiques et les tableaux de splits/tours — le seul état vraiment
 * interactif de la page, donc le seul regroupé dans un composant client.
 * `children` reçoit le bandeau de chiffres et le résumé de zones, tous deux
 * rendus côté serveur : les intercaler ici ne les fait pas basculer côté
 * client, React Server Components autorise un enfant serveur au milieu d'un
 * arbre client.
 */
export function ActivityInteractive({
  heroPoints,
  mapTilerKey,
  name,
  dateLabel,
  shiftLabel,
  sportType,
  chartPoints,
  hasHr,
  hrZones,
  splits,
  manualLaps,
  isRunActivity,
  sportColorValue,
  children,
}: {
  heroPoints: GeoPoint[];
  mapTilerKey?: string;
  name: string;
  dateLabel: string;
  shiftLabel: string;
  sportType: string;
  chartPoints: ChartPoint[];
  hasHr: boolean;
  hrZones: HeartRateZone[] | null;
  splits: LapRow[];
  manualLaps: LapRow[];
  isRunActivity: boolean;
  sportColorValue: string;
  children: ReactNode;
}) {
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [selection, setSelection] = useState<MapSelection | null>(null);

  return (
    <>
      <ActivityHero
        points={heroPoints}
        mapTilerKey={mapTilerKey}
        name={name}
        dateLabel={dateLabel}
        shiftLabel={shiftLabel}
        sportType={sportType}
        cursorT={hoverT}
        selection={selection}
      />

      {children}

      <Card className="mt-4">
        <CardHeader
          title="Flux détaillés"
          hint={
            chartPoints.length > 0
              ? "Survoler un graphique déplace le curseur sur la carte et les autres graphiques."
              : "Aucun flux importé pour cette activité."
          }
        />
        <CardBody>
          {chartPoints.length > 0 ? (
            <ActivityCharts
              points={chartPoints}
              hasHr={hasHr}
              hrZones={hrZones}
              hoverT={hoverT}
              onHoverT={setHoverT}
              selection={selection}
            />
          ) : (
            <p className="text-xs text-[var(--color-faint)]">
              Les flux seconde par seconde ne sont pas encore importés pour cette
              activité. Ils arrivent par la file de synchronisation.
            </p>
          )}
        </CardBody>
      </Card>

      {splits.length > 0 ? (
        <Card className="mt-4">
          <CardHeader
            title="Splits"
            hint="Un clic sélectionne le kilomètre sur la carte et les graphiques."
            action={<Badge>{splits.length} km</Badge>}
          />
          <LapRowsTable
            rows={splits}
            isRunActivity={isRunActivity}
            sportColor={sportColorValue}
            selection={selection}
            onSelect={setSelection}
          />
        </Card>
      ) : null}

      {manualLaps.length > 0 ? (
        <Card className="mt-4">
          <CardHeader
            title="Tours"
            hint="Tours déclenchés manuellement — pas un découpage kilométrique."
            action={<Badge>{manualLaps.length} tour{manualLaps.length > 1 ? "s" : ""}</Badge>}
          />
          <LapRowsTable
            rows={manualLaps}
            isRunActivity={isRunActivity}
            sportColor={sportColorValue}
            selection={selection}
            onSelect={setSelection}
          />
        </Card>
      ) : null}
    </>
  );
}
