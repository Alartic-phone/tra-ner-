"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  Area,
  AreaChart,
} from "recharts";
import { formatDayShort } from "@/lib/time.ts";

export type FitnessRow = {
  day: string;
  load: number;
  ctl: number;
  atl: number;
  tsb: number;
  reliable: boolean;
};

const axisProps = {
  stroke: "var(--chart-axis)",
  fontSize: 10,
  tickLine: false,
  axisLine: false,
} as const;

const tooltipStyle = {
  backgroundColor: "var(--color-surface-2)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 6,
  fontSize: 11,
} as const;

/**
 * Charge quotidienne, condition physique et fatigue.
 *
 * Les trois grandeurs partagent la même unité (le TRIMP), donc un seul axe :
 * un second axe rendrait les croisements de courbes arbitraires et donc
 * trompeurs. La forme (TSB) est pour cette raison tracée à part, dans son
 * propre graphique, plutôt que superposée sur une seconde échelle.
 */
export function FitnessChart({ rows }: { rows: FitnessRow[] }) {
  const last = rows[rows.length - 1];
  const firstReliable = rows.find((r) => r.reliable)?.day;
  const unreliableUntil =
    firstReliable && rows[0] && firstReliable !== rows[0].day ? firstReliable : null;

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={rows} margin={{ top: 8, right: 44, bottom: 0, left: -14 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />

          {/* Zone d'amorçage : la moyenne mobile à 42 jours part de zéro et
              n'est pas encore représentative. On le montre au lieu de la
              masquer. */}
          {unreliableUntil ? (
            <ReferenceArea
              x1={rows[0]!.day}
              x2={unreliableUntil}
              fill="var(--color-faint)"
              fillOpacity={0.07}
              label={{
                value: "amorçage",
                position: "insideTopLeft",
                fill: "var(--color-faint)",
                fontSize: 9,
              }}
            />
          ) : null}

          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => formatDayShort(d)}
            minTickGap={40}
            {...axisProps}
          />
          <YAxis {...axisProps} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }}
            labelFormatter={(d: string) => formatDayShort(d)}
            formatter={(value: number, name: string) => [Math.round(value), name]}
          />
          <Legend
            verticalAlign="top"
            height={24}
            iconType="plainline"
            wrapperStyle={{ fontSize: 11, color: "var(--color-muted)" }}
          />

          <Bar
            dataKey="load"
            name="Charge du jour"
            fill="var(--chart-neutral)"
            radius={[2, 2, 0, 0]}
            maxBarSize={6}
            isAnimationActive={false}
          />
          <Line
            dataKey="ctl"
            name="Condition physique (42 j)"
            stroke="var(--chart-1)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            dataKey="atl"
            name="Fatigue (7 j)"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />

          {/* Étiquettes directes sur la dernière valeur : la légende dit qui
              est qui, ces repères disent où on en est. */}
          {last ? (
            <ReferenceLine
              y={last.ctl}
              stroke="transparent"
              label={{
                value: String(Math.round(last.ctl)),
                position: "right",
                fill: "var(--chart-1)",
                fontSize: 11,
              }}
            />
          ) : null}
          {last ? (
            <ReferenceLine
              y={last.atl}
              stroke="transparent"
              label={{
                value: String(Math.round(last.atl)),
                position: "right",
                fill: "var(--chart-2)",
                fontSize: 11,
              }}
            />
          ) : null}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Forme (TSB = condition physique − fatigue).
 *
 * Grandeur signée : encodage divergent, deux pôles opposés de part et d'autre
 * d'un zéro explicitement tracé. Positif = frais, négatif = en charge.
 */
export function FormChart({ rows }: { rows: FitnessRow[] }) {
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
          <defs>
            <linearGradient id="tsbFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--chart-positive)" stopOpacity={0.35} />
              <stop offset="50%" stopColor="var(--chart-positive)" stopOpacity={0.05} />
              <stop offset="50%" stopColor="var(--chart-negative)" stopOpacity={0.05} />
              <stop offset="100%" stopColor="var(--chart-negative)" stopOpacity={0.35} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => formatDayShort(d)}
            minTickGap={40}
            {...axisProps}
          />
          <YAxis {...axisProps} />
          <ReferenceLine y={0} stroke="var(--color-border-strong)" strokeWidth={1} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }}
            labelFormatter={(d: string) => formatDayShort(d)}
            formatter={(value: number) => [Math.round(value), "Forme"]}
          />
          <Area
            dataKey="tsb"
            stroke="var(--chart-positive)"
            strokeWidth={2}
            fill="url(#tsbFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Ratio aigu/chronique, avec la zone considérée comme optimale (0,8-1,3)
 * matérialisée en fond et le seuil d'alerte (1,5) tracé.
 */
export function AcwrChart({
  rows,
}: {
  rows: Array<{ day: string; ratio: number | null }>;
}) {
  return (
    <div className="h-40 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <ReferenceArea
            y1={0.8}
            y2={1.3}
            fill="var(--color-ok)"
            fillOpacity={0.09}
            label={{
              value: "zone optimale",
              position: "insideTopLeft",
              fill: "var(--color-muted)",
              fontSize: 9,
            }}
          />
          <ReferenceLine
            y={1.5}
            stroke="var(--color-danger)"
            strokeDasharray="4 3"
            label={{
              value: "alerte 1,5",
              position: "right",
              fill: "var(--color-danger)",
              fontSize: 9,
            }}
          />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => formatDayShort(d)}
            minTickGap={40}
            {...axisProps}
          />
          <YAxis domain={[0, "auto"]} {...axisProps} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ stroke: "var(--color-border-strong)", strokeWidth: 1 }}
            labelFormatter={(d: string) => formatDayShort(d)}
            formatter={(value: number) => [value.toFixed(2), "Ratio aigu/chronique"]}
          />
          <Area
            dataKey="ratio"
            stroke="var(--chart-1)"
            strokeWidth={2}
            fill="var(--chart-1)"
            fillOpacity={0.12}
            connectNulls={false}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
