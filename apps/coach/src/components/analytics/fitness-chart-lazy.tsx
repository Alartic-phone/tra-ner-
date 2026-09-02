"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import type { FitnessChart as FitnessChartType, FormChart as FormChartType, AcwrChart as AcwrChartType } from "./fitness-chart.tsx";

/**
 * Chargement à la demande : Recharts ne doit jamais alourdir le lot JS
 * initial d'une page (cible : aucune page au-dessus de 200 ko). `ssr: false`
 * est sans coût, ces graphiques exigent de toute façon une mesure côté
 * client. `next/dynamic({ ssr:false })` n'est permis que depuis un composant
 * client — d'où ce fichier, plutôt qu'un import direct depuis les pages
 * serveur (`/analyses`).
 */
const Skeleton = ({ className = "h-64" }: { className?: string }) => (
  <div className={`w-full animate-pulse rounded-lg bg-[var(--color-surface-2)] ${className}`} />
);

export const FitnessChart = dynamic<ComponentProps<typeof FitnessChartType>>(
  () => import("./fitness-chart.tsx").then((m) => m.FitnessChart),
  { ssr: false, loading: () => <Skeleton /> },
);

export const FormChart = dynamic<ComponentProps<typeof FormChartType>>(
  () => import("./fitness-chart.tsx").then((m) => m.FormChart),
  { ssr: false, loading: () => <Skeleton /> },
);

export const AcwrChart = dynamic<ComponentProps<typeof AcwrChartType>>(
  () => import("./fitness-chart.tsx").then((m) => m.AcwrChart),
  { ssr: false, loading: () => <Skeleton /> },
);
