"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton.tsx";

/**
 * Wrapper client pour charger Recharts (>100 ko à lui seul) en chunk séparé,
 * jamais dans le JS initial de /analyses. `ssr: false` exige un composant
 * client — un Server Component ne peut pas le déclarer lui-même.
 */
export const FitnessChart = dynamic(
  () => import("./fitness-chart.tsx").then((m) => m.FitnessChart),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

export const FormChart = dynamic(
  () => import("./fitness-chart.tsx").then((m) => m.FormChart),
  { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> },
);

export const AcwrChart = dynamic(
  () => import("./fitness-chart.tsx").then((m) => m.AcwrChart),
  { ssr: false, loading: () => <Skeleton className="h-40 w-full" /> },
);
