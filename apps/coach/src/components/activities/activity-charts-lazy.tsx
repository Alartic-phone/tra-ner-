"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton.tsx";

/**
 * Wrapper client pour charger Recharts (>100 ko à lui seul) en chunk séparé,
 * jamais dans le JS initial de la page activité. `ssr: false` exige un
 * composant client — un Server Component ne peut pas le déclarer lui-même.
 */
export const ActivityCharts = dynamic(
  () => import("./activity-charts.tsx").then((m) => m.ActivityCharts),
  { ssr: false, loading: () => <Skeleton className="h-48 w-full" /> },
);
