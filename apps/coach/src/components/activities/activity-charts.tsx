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
}: {
  points: ChartPoint[];
  hasHr: boolean;
}) {
  const hrValues = points.map((p) => p.hr).filter((v): v is number => v != null);
  const hrDomain: [number, number] =
    hrValues.length > 0
      ? [Math.floor(Math.min(...hrValues) / 5) * 5, Math.ceil(Math.max(...hrValues) / 5) * 5]
      : [0, 200];

  const paceValues = points.map((p) => p.paceSPerKm).filter((v): v is number => v != null);
  const paceDomain: [number, number] =
    paceValues.length > 0
      ? [Math.floor(Math.min(...paceValues) / 15) * 15, Math.ceil(Math.max(...paceValues) / 15) * 15]
      : [180, 600];

  const altValues = points.map((p) => p.altitude).filter((v): v is number => v != null);

  const axis = {
    stroke: "var(--color-faint)",
    fontSize: 10,
    tickLine: false,
    axisLine: false,
  } as const;

  return (
    <div className="space-y-5">
      {hasHr ? (
        <Chart title="Fréquence cardiaque" unit="bpm">
          <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
            <CartesianGrid stroke="var(--color-border)" vertical={false} />
            <XAxis dataKey="t" tickFormatter={(t: number) => formatClock(t)} {...axis} />
            <YAxis domain={hrDomain} {...axis} />
            <Tooltip
              contentStyle={tooltipStyle}
              labelFormatter={(t: number) => formatClock(t)}
              formatter={(v: number) => [`${Math.round(v)} bpm`, "FC"]}
            />
            <Line
              type="monotone"
              dataKey="hr"
              stroke="var(--color-danger)"
              dot={false}
              strokeWidth={1.3}
              connectNulls={false}
              isAnimationActive={false}
            />
          </LineChart>
        </Chart>
      ) : (
        <p className="text-xs text-[var(--color-faint)]">
          Fréquence cardiaque non disponible sur cette activité.
        </p>
      )}

      {paceValues.length > 0 ? (
        <Chart title="Allure" unit="min/km — axe inversé, le haut est plus rapide">
          <LineChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -4 }}>
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
              isAnimationActive={false}
            />
          </LineChart>
        </Chart>
      ) : null}

      {altValues.length > 0 ? (
        <Chart title="Altitude" unit="m">
          <AreaChart data={points} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
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
              isAnimationActive={false}
            />
          </AreaChart>
        </Chart>
      ) : null}
    </div>
  );
}

const tooltipStyle = {
  backgroundColor: "var(--color-surface-2)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 6,
  fontSize: 11,
} as const;

function Chart({
  title,
  unit,
  children,
}: {
  title: string;
  unit: string;
  children: ReactElement;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <h3 className="text-xs font-medium">{title}</h3>
        <span className="text-[10px] text-[var(--color-faint)]">{unit}</span>
      </div>
      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {children}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
