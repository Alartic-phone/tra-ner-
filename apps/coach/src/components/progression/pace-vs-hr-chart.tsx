"use client";

import { CartesianGrid, Cell, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { formatDayLong } from "@/lib/time.ts";
import { formatPace } from "@/lib/utils.ts";
import type { Day } from "@/lib/shifts/day.ts";

/**
 * Allure × FC moyenne, sorties de plus de trente minutes. Seules les
 * activités avec FC réellement mesurée entrent dans le nuage — la charge
 * (TRIMP) peut retomber sur le RPE en dernier recours, pas ce nuage.
 */

export type PaceHrPoint = { day: Day; activityId: string; paceSPerKm: number; avgHr: number };

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

export function PaceVsHrChart({ points }: { points: PaceHrPoint[] }) {
  // Couleur par mois, du plus ancien (--chart-seq-1) au plus récent
  // (--chart-seq-5) : une rampe à teinte unique parce que les mois sont
  // ordonnés dans le temps, pas une catégorisation arbitraire (même
  // justification que PHASE_RAMP dans plan-view.tsx).
  const months = [...new Set(points.map((p) => p.day.slice(0, 7)))].sort();
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const colorForMonth = (month: string): string => {
    const i = monthIndex.get(month) ?? 0;
    const t = months.length > 1 ? i / (months.length - 1) : 1;
    return `color-mix(in oklab, var(--chart-seq-5) ${Math.round(t * 100)}%, var(--chart-seq-1))`;
  };

  return (
    <div>
      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="var(--chart-grid)" />
            <XAxis
              dataKey="paceSPerKm"
              type="number"
              name="Allure"
              domain={["auto", "auto"]}
              tickFormatter={(v: number) => formatPace(v)}
              {...axisProps}
            />
            <YAxis
              dataKey="avgHr"
              type="number"
              name="FC moyenne"
              domain={["auto", "auto"]}
              unit=" bpm"
              {...axisProps}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "var(--color-border-strong)" }}
              content={(props) => {
                const point = props.payload?.[0]?.payload as PaceHrPoint | undefined;
                if (!props.active || !point) return null;
                return (
                  <div style={tooltipStyle} className="px-2 py-1.5">
                    <div className="text-[var(--color-muted)]">{formatDayLong(point.day)}</div>
                    <div className="mt-0.5 tabular">
                      {formatPace(point.paceSPerKm)} · {Math.round(point.avgHr)} bpm
                    </div>
                  </div>
                );
              }}
            />
            <Scatter data={points} isAnimationActive animationDuration={600}>
              {points.map((p) => (
                <Cell key={p.activityId} fill={colorForMonth(p.day.slice(0, 7))} />
              ))}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      {months.length > 1 ? (
        <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] text-[var(--color-faint)]">
          <span>{months[0]}</span>
          <span
            className="h-1.5 w-16 rounded-[var(--radius-pill)]"
            style={{
              backgroundImage: "linear-gradient(to right, var(--chart-seq-1), var(--chart-seq-5))",
            }}
          />
          <span>{months[months.length - 1]}</span>
        </div>
      ) : null}
    </div>
  );
}
