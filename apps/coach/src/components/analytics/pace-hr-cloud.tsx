"use client";

import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { formatPace } from "@/lib/utils.ts";
import type { PaceHrPoint } from "@/lib/progression-repository.ts";

/** Rampe ordinale à teinte unique (globals.css) — les mois forment une série ordonnée, pas des catégories indépendantes. */
const CHART_SEQ = ["var(--chart-seq-1)", "var(--chart-seq-2)", "var(--chart-seq-3)", "var(--chart-seq-4)", "var(--chart-seq-5)"];

/**
 * Nuage allure × FC moyenne : quand il glisse vers le bas à gauche (allure
 * plus rapide pour une FC égale, ou FC plus basse à allure égale), la
 * condition aérobie progresse. Coloré par mois pour lire le sens du
 * déplacement — c'est la phrase d'accompagnement, pas le nuage seul, qui
 * rend ce graphique utile (spec /progression).
 */
export function PaceHrCloud({ points }: { points: PaceHrPoint[] }) {
  if (points.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        Pas encore assez de sorties de plus de 30 minutes avec fréquence cardiaque pour ce nuage.
      </p>
    );
  }

  const months = [...new Set(points.map((p) => p.month))].sort();
  const colorForMonth = (month: string) => {
    const i = months.indexOf(month);
    const bucket = months.length <= 1 ? 0 : Math.min(4, Math.floor((i / (months.length - 1)) * 4));
    return CHART_SEQ[bucket]!;
  };

  const paceValues = points.map((p) => p.paceSPerKm);
  const hrValues = points.map((p) => p.avgHr);

  return (
    <div>
      <p className="sr-only">
        {points.length} sorties de plus de 30 minutes entre {formatPace(Math.min(...paceValues))} et{" "}
        {formatPace(Math.max(...paceValues))}, fréquence cardiaque entre {Math.min(...hrValues)} et{" "}
        {Math.max(...hrValues)} bpm.
      </p>
      <div className="h-64 w-full" aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 8, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid stroke="var(--color-border)" />
            <XAxis
              type="number"
              dataKey="paceSPerKm"
              name="Allure"
              domain={[Math.floor(Math.min(...paceValues) / 15) * 15, Math.ceil(Math.max(...paceValues) / 15) * 15]}
              tickFormatter={(v: number) => formatPace(v).replace("/km", "")}
              stroke="var(--color-faint)"
              fontSize={10}
              tickLine={false}
              reversed
            />
            <YAxis
              type="number"
              dataKey="avgHr"
              name="FC moyenne"
              domain={[Math.floor(Math.min(...hrValues) / 5) * 5, Math.ceil(Math.max(...hrValues) / 5) * 5]}
              stroke="var(--color-faint)"
              fontSize={10}
              tickLine={false}
            />
            <Tooltip
              cursor={{ strokeDasharray: "3 3", stroke: "var(--color-border-strong)" }}
              contentStyle={{
                backgroundColor: "var(--color-surface-2)",
                border: "1px solid var(--color-border-strong)",
                borderRadius: 10,
                fontSize: 11,
              }}
              formatter={(value: number, name: string) => [
                name === "Allure" ? formatPace(value) : `${Math.round(value)} bpm`,
                name,
              ]}
            />
            <Scatter data={points} fill="var(--chart-seq-3)" shape={(props: { cx?: number; cy?: number; payload?: PaceHrPoint }) => (
              <circle cx={props.cx} cy={props.cy} r={4} fill={colorForMonth(props.payload!.month)} fillOpacity={0.75} />
            )} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-xs text-[var(--color-muted)]">
        Quand le nuage glisse vers le bas à gauche (allure plus rapide pour une fréquence cardiaque
        égale), la condition aérobie progresse. Chaque point est une sortie de plus de 30 minutes,
        coloré du plus ancien (clair) au plus récent (foncé).
      </p>
    </div>
  );
}
