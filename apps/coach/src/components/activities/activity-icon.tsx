import { Activity as ActivityIconFallback, Bike, Footprints, Waves } from "lucide-react";

/**
 * Catégorie de sport déduite du type Strava brut (`Activity.type`, cf.
 * `RUN_TYPES` dans `lib/strava/mapping.ts`). Un seul classement, partagé par
 * l'icône, la couleur et les agrégats hebdomadaires du fil d'activités —
 * pour ne jamais faire diverger « c'est une course » selon l'endroit du code.
 */
export type SportCategory = "run" | "ride" | "swim" | "other";

export function sportCategory(type: string): SportCategory {
  if (/run/i.test(type)) return "run";
  if (/ride|bike|cycl/i.test(type)) return "ride";
  if (/swim/i.test(type)) return "swim";
  return "other";
}

/**
 * Icône par type d'activité brut. Purement décoratif : ne remplace jamais le
 * libellé texte déjà affiché à côté.
 */
export function ActivityTypeIcon({
  type,
  size = 16,
  className,
}: {
  type: string;
  size?: number;
  className?: string;
}) {
  const category = sportCategory(type);
  if (category === "run") return <Footprints size={size} className={className} aria-hidden />;
  if (category === "ride") return <Bike size={size} className={className} aria-hidden />;
  if (category === "swim") return <Waves size={size} className={className} aria-hidden />;
  return <ActivityIconFallback size={size} className={className} aria-hidden />;
}

/** Teinte associée au sport (cercle d'icône, pastille de filtre). */
export function sportColor(type: string): string {
  const category = sportCategory(type);
  if (category === "run") return "var(--sport-run)";
  if (category === "ride") return "var(--sport-ride)";
  if (category === "swim") return "var(--sport-swim)";
  return "var(--sport-other)";
}
