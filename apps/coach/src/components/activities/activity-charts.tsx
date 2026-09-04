"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { ReactElement } from "react";
import type { ChartPoint } from "@/lib/streams.ts";
import { formatClock, formatPace } from "@/lib/utils.ts";
import { zoneForHeartRate, type HeartRateZone } from "@/lib/metrics/zones.ts";
import { ZONE_RAMP } from "@/components/analytics/zone-chart.tsx";

/** Tracé progressif de gauche à droite au chargement, comme les autres
 * graphiques temporels de l'app — jamais une courbe qui apparaît d'un coup. */
const DRAW_IN = { isAnimationActive: true, animationDuration: 800, animationEasing: "ease-out" } as const;

/**
 * Graphiques d'activité.
 *
 * Les axes ne sont jamais tronqués sans le dire : l'axe de fréquence
 * cardiaque part du minimum réel arrondi, affiché tel quel, et l'axe d'allure
 * est inversé (une allure plus basse est plus rapide) pour que la lecture
 * corresponde à l'intuition sans déformer les écarts.
 */
export function ActivityCharts({
  points,
  hasHr,
  hrZones,
  onHoverIndex,
}: {
  points: ChartPoint[];
  hasHr: boolean;
  /** Zones FC du profil, pour teinter le tracé de fréquence cardiaque selon
   * l'intensité — `null`/absent si le profil n'est pas configuré : le tracé
   * revient alors à une seule couleur plutôt que d'inventer des zones. */
  hrZones?: HeartRateZone[] | null;
  /** Index survolé (dans `points`), pour synchroniser la carte — `null` en sortie de survol. */
  onHoverIndex?: (index: number | null) => void;
}) {
  // `syncId` synchronise le curseur ENTRE les quatre graphiques (mécanisme
  // natif Recharts) ; `onHoverIndex` sert à synchroniser ce même curseur
  // avec la carte, que Recharts ne connaît pas.
  const syncId = "activity-charts";
  const mouseHandlers = onHoverIndex
    ? {
        onMouseMove: (state: { activeTooltipIndex?: number }) => {
          if (typeof state?.activeTooltipIndex === "number") onHoverIndex(state.activeTooltipIndex);
        },
        onMouseLeave: () => onHoverIndex(null),
      }
    : {};

  const hrValues = points.map((p) => p.hr).filter((v): v is number => v != null);
  const hrDomain: [number, number] =
    hrValues.length > 0
      ? [Math.floor(Math.min(...hrValues) / 5) * 5, Math.ceil(Math.max(...hrValues) / 5) * 5]
      : [0, 200];

  // Dégradé vertical calé sur les bornes de zones : au-dessus du tracé, la
  // couleur indique l'intensité, exactement la même rampe que partout
  // ailleurs (cartes d'activité, calendrier). Un dégradé SVG se définit du
  // haut vers le bas — donc de la borne haute du domaine vers la basse.
  const hrGradientStops =
    hrZones && hrZones.length > 0
      ? hrZones
          .map((z) => ({
            offset: 1 - (Math.min(Math.max(z.toBpm, hrDomain[0]), hrDomain[1]) - hrDomain[0]) / (hrDomain[1] - hrDomain[0]),
            color: ZONE_RAMP[z.index - 1]!,
          }))
          .sort((a, b) => a.offset - b.offset)
      : null;

  const paceValues = points.map((p) => p.paceSPerKm).filter((v): v is number => v != null);
  const paceDomain: [number, number] =
    paceValues.length > 0
      ? [Math.floor(Math.min(...paceValues) / 15) * 15, Math.ceil(Math.max(...paceValues) / 15) * 15]
      : [180, 600];

  const altValues = points.map((p) => p.altitude).filter((v): v is number => v != null);
  const cadenceValues = points.map((p) => p.cadence).filter((v): v is number => v != null);

  const axis = {
    stroke: "var(--color-faint)",
    fontSize: 10,
    tickLine: false,
    axisLine: false,
  } as const;

  return (
    <div className="space-y-5">
      {hasHr ? (
        <Chart
          title="Fréquence cardiaque"
          unit="bpm"
          summary={`Fréquence cardiaque de ${Math.round(hrDomain[0])} à ${Math.round(hrDomain[1])} bpm sur la durée de l'activité, moyenne ${Math.round(hrValues.reduce((s, v) => s + v, 0) / hrValues.length)} bpm.`}
        >
          <AreaChart
            data={points}
            margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
            syncId={syncId}
            {...mouseHandlers}
          >
            <defs>
              <linearGradient id="hrStroke" x1="0" y1="0" x2="0" y2="1">
                {(hrGradientStops ?? [
                  { offset: 0, color: "var(--color-danger)" },
                  { offset: 1, color: "var(--color-danger)" },
                ]).map((s, i) => (
                  <stop key={i} offset={s.offset} stopColor={s.color} />
                ))}
              </linearGradient>
              <linearGradient id="hrFill" x1="0" y1="0" x2="0" y2="1">
                {(hrGradientStops ?? [
                  { offset: 0, color: "var(--color-danger)" },
                  { offset: 1, color: "var(--color-danger)" },
                ]).map((s, i) => (
                  <stop key={i} offset={s.offset} stopColor={s.color} stopOpacity={0.18} />
                ))}
              </linearGradient>
            </defs>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="t" tickFormatter={(t: number) => formatClock(t)} {...axis} />
            <YAxis domain={hrDomain} {...axis} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(t: number) => formatClock(t)}
              formatter={(v: number) => {
                const zone = hrZones ? zoneForHeartRate(v, hrZones) : null;
                return [`${Math.round(v)} bpm${zone ? ` · Z${zone.index} ${zone.name}` : ""}`, "FC"];
              }}
            />
            <Area
              type="monotone"
              dataKey="hr"
              stroke="url(#hrStroke)"
              fill="url(#hrFill)"
              dot={false}
              strokeWidth={1.5}
              connectNulls={false}
              {...DRAW_IN}
            />
          </AreaChart>
        </Chart>
      ) : (
        <p className="text-xs text-[var(--color-faint)]">
          Fréquence cardiaque non disponible sur cette activité.
        </p>
      )}

      {paceValues.length > 0 ? (
        <Chart
          title="Allure"
          unit="min/km — axe inversé, le haut est plus rapide"
          summary={`Allure entre ${formatPace(Math.min(...paceValues))} et ${formatPace(Math.max(...paceValues))} sur la durée de l'activité.`}
        >
          <LineChart
            data={points}
            margin={{ top: 4, right: 4, bottom: 0, left: -4 }}
            syncId={syncId}
            {...mouseHandlers}
          >
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="t" tickFormatter={(t: number) => formatClock(t)} {...axis} />
            <YAxis
              domain={paceDomain}
              reversed
              tickFormatter={(v: number) => formatPace(v).replace("/km", "")}
              {...axis}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(t: number) => formatClock(t)}
              formatter={(v: number) => [formatPace(v), "Allure"]}
            />
            <Line
              type="monotone"
              dataKey="paceSPerKm"
              stroke="var(--color-accent)"
              dot={false}
              strokeWidth={1.3}
              connectNulls={false}
              {...DRAW_IN}
            />
          </LineChart>
        </Chart>
      ) : null}

      {altValues.length > 0 ? (
        <Chart
          title="Altitude"
          unit="m"
          summary={`Altitude entre ${Math.round(Math.min(...altValues))} et ${Math.round(Math.max(...altValues))} m sur la durée de l'activité.`}
        >
          <AreaChart
            data={points}
            margin={{ top: 4, right: 4, bottom: 0, left: -12 }}
            syncId={syncId}
            {...mouseHandlers}
          >
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="t" tickFormatter={(t: number) => formatClock(t)} {...axis} />
            <YAxis
              domain={[Math.floor(Math.min(...altValues)), Math.ceil(Math.max(...altValues))]}
              {...axis}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(t: number) => formatClock(t)}
              formatter={(v: number) => [`${Math.round(v)} m`, "Altitude"]}
            />
            <Area
              type="monotone"
              dataKey="altitude"
              stroke="var(--color-info)"
              fill="var(--color-info)"
              fillOpacity={0.15}
              strokeWidth={1.2}
              connectNulls={false}
              {...DRAW_IN}
            />
          </AreaChart>
        </Chart>
      ) : null}

      {cadenceValues.length > 0 ? (
        <Chart
          title="Cadence"
          unit="pas/min"
          summary={`Cadence entre ${Math.round(Math.min(...cadenceValues))} et ${Math.round(Math.max(...cadenceValues))} pas/min sur la durée de l'activité.`}
        >
          <LineChart
            data={points}
            margin={{ top: 4, right: 4, bottom: 0, left: -4 }}
            syncId={syncId}
            {...mouseHandlers}
          >
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="t" tickFormatter={(t: number) => formatClock(t)} {...axis} />
            <YAxis
              domain={[Math.floor(Math.min(...cadenceValues) / 5) * 5, Math.ceil(Math.max(...cadenceValues) / 5) * 5]}
              {...axis}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(t: number) => formatClock(t)}
              formatter={(v: number) => [`${Math.round(v)} pas/min`, "Cadence"]}
            />
            <Line
              type="monotone"
              dataKey="cadence"
              stroke="var(--color-ok)"
              dot={false}
              strokeWidth={1.3}
              connectNulls={false}
              {...DRAW_IN}
            />
          </LineChart>
        </Chart>
      ) : null}
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "var(--color-surface-2)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 10,
  fontSize: 11,
  boxShadow: "var(--shadow-elevated)",
} as const;

function Chart({
  title,
  unit,
  summary,
  children,
}: {
  title: string;
  unit: string;
  /** Alternative textuelle décrivant la tendance — chaque graphique doit en avoir une (spec accessibilité). */
  summary: string;
  children: ReactElement;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <h3 className="text-xs font-medium">{title}</h3>
        <span className="text-[10px] text-[var(--color-faint)]">{unit}</span>
      </div>
      <p className="sr-only">{summary}</p>
      <div className="h-40 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
