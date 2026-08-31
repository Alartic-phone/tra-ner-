"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatDayShort } from "@/lib/time.ts";
import type { Day } from "@/lib/shifts/day.ts";

/**
 * Marches d'escalier de la plus longue sortie : chaque marche est une sortie
 * qui a réellement battu le record précédent (cf. `loadLongestRunProgression`),
 * jamais une interpolation entre deux records.
 */

export type LongestRunStep = { day: Day; distanceKm: number };

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

export function LongestRunStepsChart({ steps }: { steps: LongestRunStep[] }) {
  // Étiquette la date au-dessus de chaque marche — c'est la date qu'on veut
  // lire ici, pas la valeur (déjà lisible sur l'axe Y et au survol).
  function StepDateLabel(props: { x?: number; y?: number; index?: number }) {
    const { x, y, index } = props;
    const day = x != null && y != null && index != null ? steps[index]?.day : null;
    if (!day) return <g />;
    return (
      <text x={x} y={y! - 10} textAnchor="middle" fontSize={9} fill="var(--color-muted)">
        {formatDayShort(day)}
      </text>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={steps} margin={{ top: 20, right: 16, bottom: 4, left: -8 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={(d: Day) => formatDayShort(d)} {...axisProps} />
          <YAxis {...axisProps} unit=" km" />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(d: Day) => formatDayShort(d)}
            formatter={(value: number) => [`${value.toFixed(2)} km`, "Plus longue sortie"]}
          />
          <Line
            type="stepAfter"
            dataKey="distanceKm"
            name="Plus longue sortie"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--color-accent)", strokeWidth: 0 }}
            label={StepDateLabel}
            isAnimationActive
            animationDuration={800}
            animationEasing="ease-out"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
