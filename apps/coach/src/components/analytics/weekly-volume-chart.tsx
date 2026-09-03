"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDayShort } from "@/lib/time.ts";
import type { WeeklyVolumePoint } from "@/lib/progression-repository.ts";

/** Volume hebdomadaire, course et vélo distincts (deux sports, deux unités de vitesse — jamais fondus), cible du plan actif en pointillés. */
export function WeeklyVolumeChart({ points }: { points: WeeklyVolumePoint[] }) {
  const hasTarget = points.some((p) => p.targetKm != null);

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--color-border)" vertical={false} />
          <XAxis
            dataKey="weekStart"
            tickFormatter={(d: string) => formatDayShort(d)}
            stroke="var(--color-faint)"
            fontSize={10}
            tickLine={false}
            axisLine={false}
          />
          <YAxis stroke="var(--color-faint)" fontSize={10} tickLine={false} axisLine={false} unit=" km" />
          <Tooltip
            contentStyle={{
              backgroundColor: "var(--color-surface-2)",
              border: "1px solid var(--color-border-strong)",
              borderRadius: 10,
              fontSize: 11,
            }}
            labelFormatter={(d: string) => formatDayShort(d)}
            formatter={(v: number, name: string) => [`${v.toFixed(1)} km`, name]}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar dataKey="runKm" name="Course" stackId="volume" fill="var(--sport-run)" radius={[0, 0, 0, 0]} />
          <Bar dataKey="rideKm" name="Vélo" stackId="volume" fill="var(--sport-ride)" radius={[2, 2, 0, 0]} />
          {hasTarget ? (
            <Line
              dataKey="targetKm"
              name="Cible du plan"
              stroke="var(--color-muted)"
              strokeDasharray="4 4"
              dot={false}
              connectNulls
            />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
