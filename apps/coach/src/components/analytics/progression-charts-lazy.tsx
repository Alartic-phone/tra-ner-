"use client";

import dynamic from "next/dynamic";
import { ChartSkeleton } from "@/components/ui/chart-skeleton.tsx";

/** Recharts en import dynamique (perf — spec refonte §7), cf. fitness-chart-lazy.tsx pour le même principe. */
export const PaceHrCloud = dynamic(() => import("./pace-hr-cloud.tsx").then((m) => m.PaceHrCloud), {
  ssr: false,
  loading: () => <ChartSkeleton height={256} />,
});
export const WeeklyVolumeChart = dynamic(
  () => import("./weekly-volume-chart.tsx").then((m) => m.WeeklyVolumeChart),
  { ssr: false, loading: () => <ChartSkeleton height={256} /> },
);
