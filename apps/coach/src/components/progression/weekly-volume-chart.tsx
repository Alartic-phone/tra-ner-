"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDayShort } from "@/lib/time.ts";
import type { Day } from "@/lib/shifts/day.ts";

/** Course et vélo empilés, douze dernières semaines, cible du plan en pointillés. */

export type WeeklyVolumeRow = { weekStart: Day; runKm: number; rideKm: number };

const DRAW_IN = { isAnimationActive: true, animationDuration: 700, animationEasing: "ease-out" } as const;

const axisProps = {
  stroke: "var(--chart-axis)",
  fontSize: 10,
  tickLine: false,
  axisLine: false,
} as const;

const tooltipStyle = {
  backgroundColor: "var(--color-surface-2)",
  border: "1px solid var(--color-border-strong)",
  borderRadius: 10,
  fontSize: 11,
  boxShadow: "var(--shadow-elevated)",
} as const;

export function WeeklyVolumeChart({
  rows,
  targetKm,
}: {
  rows: WeeklyVolumeRow[];
  /** Cible hebdomadaire de la phase de plan active aujourd'hui, si elle existe. */
  targetKm: number | null;
}) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -14 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="weekStart"
            tickFormatter={(d: Day) => formatDayShort(d)}
            {...axisProps}
          />
          <YAxis {...axisProps} unit=" km" />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ fill: "var(--color-surface-2)" }}
            labelFormatter={(d: Day) => `Semaine du ${formatDayShort(d)}`}
            formatter={(value: number, name: string) => [`${value.toFixed(1)} km`, name]}
          />
          <Legend
            verticalAlign="top"
            height={24}
            iconType="square"
            wrapperStyle={{ fontSize: 11, color: "var(--color-muted)" }}
          />
          {targetKm != null ? (
            <ReferenceLine
              y={targetKm}
              stroke="var(--color-accent)"
              strokeDasharray="4 3"
              label={{
                value: `cible ${targetKm} km`,
                position: "right",
                fill: "var(--color-accent)",
                fontSize: 9,
              }}
            />
          ) : null}
          <Bar dataKey="runKm" name="Course" stackId="volume" fill="var(--chart-1)" {...DRAW_IN} />
          <Bar
            dataKey="rideKm"
            name="Vélo"
            stackId="volume"
            fill="var(--chart-2)"
            radius={[3, 3, 0, 0]}
            {...DRAW_IN}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
