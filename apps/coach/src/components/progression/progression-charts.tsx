"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { formatDayShort } from "@/lib/time.ts";
import { formatDistance, formatPace } from "@/lib/utils.ts";

const DRAW_IN = { isAnimationActive: true, animationDuration: 800, animationEasing: "ease-out" } as const;

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

export type StaircasePoint = { day: string; distanceKm: number };

/** Progression de la plus longue sortie, en marches d'escalier : un record
 * ne "monte" que le jour où il est réellement battu, jamais entre-temps. */
export function LongestRunStaircase({ points }: { points: StaircasePoint[] }) {
  if (points.length === 0) {
    return <p className="text-xs text-[var(--color-muted)]">Aucune course à pied enregistrée.</p>;
  }
  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis dataKey="day" tickFormatter={(d: string) => formatDayShort(d)} {...axisProps} />
          <YAxis {...axisProps} unit=" km" />
          <Tooltip
            contentStyle={tooltipStyle}
            labelFormatter={(d: string) => formatDayShort(d)}
            formatter={(v: number) => [`${v.toFixed(1)} km`, "Plus longue sortie"]}
          />
          <Line
            type="stepAfter"
            dataKey="distanceKm"
            stroke="var(--chart-1)"
            dot={{ r: 2.5, fill: "var(--chart-1)" }}
            strokeWidth={1.5}
            {...DRAW_IN}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export type PaceHrPoint = { day: string; paceSPerKm: number; avgHr: number; distanceM: number };

/** Rampe à teinte unique (jamais un arc-en-ciel) : plus un point est ancien,
 * plus il est sombre — le mois courant ressort naturellement, sans légende
 * à douze entrées. */
const RECENCY_RAMP = [
  "var(--chart-seq-1)",
  "var(--chart-seq-2)",
  "var(--chart-seq-3)",
  "var(--chart-seq-4)",
  "var(--chart-seq-5)",
] as const;

function monthsAgo(day: string, now: string): number {
  const [ny, nm] = now.split("-").map(Number) as [number, number];
  const [dy, dm] = day.split("-").map(Number) as [number, number];
  return (ny - dy) * 12 + (nm - dm);
}

export function PaceHrCloud({ points, now }: { points: PaceHrPoint[]; now: string }) {
  if (points.length === 0) {
    return (
      <p className="text-xs text-[var(--color-muted)]">
        Aucune sortie avec allure et fréquence cardiaque sur la période.
      </p>
    );
  }

  const buckets = RECENCY_RAMP.map((color, i) => ({
    color,
    data: points.filter((p) => {
      const bucket = Math.min(4, Math.floor(monthsAgo(p.day, now) / 2.4));
      // Bucket 4 (le plus sombre) = le plus ancien ; on inverse l'index pour
      // que le mois courant utilise la teinte la plus claire (seq-5).
      return 4 - bucket === i;
    }),
  }));

  const paceValues = points.map((p) => p.paceSPerKm);
  const paceDomain: [number, number] = [
    Math.floor(Math.min(...paceValues) / 15) * 15,
    Math.ceil(Math.max(...paceValues) / 15) * 15,
  ];

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: -12 }}>
          <CartesianGrid stroke="var(--chart-grid)" />
          <XAxis
            type="number"
            dataKey="paceSPerKm"
            domain={paceDomain}
            reversed
            tickFormatter={(v: number) => formatPace(v).replace("/km", "")}
            {...axisProps}
          />
          <YAxis type="number" dataKey="avgHr" unit=" bpm" {...axisProps} />
          <ZAxis type="number" dataKey="distanceM" range={[20, 140]} />
          <Tooltip
            contentStyle={tooltipStyle}
            cursor={{ strokeDasharray: "3 3" }}
            formatter={(value: number, name: string) => {
              if (name === "paceSPerKm") return [formatPace(value), "Allure"];
              if (name === "avgHr") return [`${Math.round(value)} bpm`, "FC moyenne"];
              return [formatDistance(value), "Distance"];
            }}
          />
          {buckets.map((b, i) =>
            b.data.length > 0 ? (
              <Scatter key={i} data={b.data} fill={b.color} fillOpacity={0.75} isAnimationActive={false} />
            ) : null,
          )}
        </ScatterChart>
      </ResponsiveContainer>
      <p className="mt-1 text-[10px] text-[var(--color-faint)]">
        Plus clair = plus récent. Taille du point = distance de la sortie.
      </p>
    </div>
  );
}
