"use client";

import dynamic from "next/dynamic";
import { ChartSkeleton } from "@/components/ui/chart-skeleton.tsx";

/**
 * Recharts en import dynamique (perf — spec refonte §7) : ce fichier est le
 * SEUL point où /analyses (composant serveur) touche à Recharts, pour que
 * `ssr:false` reste valide (autorisé uniquement depuis un Client Component).
 */
export const FitnessChart = dynamic(() => import("./fitness-chart.tsx").then((m) => m.FitnessChart), {
  ssr: false,
  loading: () => <ChartSkeleton height={240} />,
});
export const FormChart = dynamic(() => import("./fitness-chart.tsx").then((m) => m.FormChart), {
  ssr: false,
  loading: () => <ChartSkeleton height={200} />,
});
export const AcwrChart = dynamic(() => import("./fitness-chart.tsx").then((m) => m.AcwrChart), {
  ssr: false,
  loading: () => <ChartSkeleton height={200} />,
});
