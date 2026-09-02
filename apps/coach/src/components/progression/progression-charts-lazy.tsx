"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type {
  LongestRunStaircase as LongestRunStaircaseType,
  PaceHrCloud as PaceHrCloudType,
} from "./progression-charts.tsx";

/** Même raison que fitness-chart-lazy.tsx : Recharts chargé à la demande,
 * jamais dans le lot JS initial d'une page. */
const Skeleton = ({ className = "h-48" }: { className?: string }) => (
  <div className={`w-full animate-pulse rounded-lg bg-[var(--color-surface-2)] ${className}`} />
);

export const LongestRunStaircase = dynamic<ComponentProps<typeof LongestRunStaircaseType>>(
  () => import("./progression-charts.tsx").then((m) => m.LongestRunStaircase),
  { ssr: false, loading: () => <Skeleton className="h-48" /> },
);

export const PaceHrCloud = dynamic<ComponentProps<typeof PaceHrCloudType>>(
  () => import("./progression-charts.tsx").then((m) => m.PaceHrCloud),
  { ssr: false, loading: () => <Skeleton className="h-64" /> },
);
