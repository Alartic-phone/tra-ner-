import { Activity as ActivityIconFallback, Bike, Footprints, Waves } from "lucide-react";

/**
 * Icône par type d'activité brut (`Activity.type`, vocabulaire Strava —
 * cf. `RUN_TYPES` dans `lib/strava/mapping.ts`). Purement décoratif : ne
 * remplace jamais le libellé texte déjà affiché à côté.
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
  if (/run/i.test(type)) return <Footprints size={size} className={className} aria-hidden />;
  if (/ride|bike|cycl/i.test(type)) return <Bike size={size} className={className} aria-hidden />;
  if (/swim/i.test(type)) return <Waves size={size} className={className} aria-hidden />;
  return <ActivityIconFallback size={size} className={className} aria-hidden />;
}

/** Teinte associée au sport (cercle d'icône, pastille de filtre). */
export function sportColor(type: string): string {
  if (/run/i.test(type)) return "var(--sport-run)";
  if (/ride|bike|cycl/i.test(type)) return "var(--sport-ride)";
  if (/swim/i.test(type)) return "var(--sport-swim)";
  return "var(--sport-other)";
}

/** Libellé français court du sport, pour le badge de la page d'activité. */
export function sportLabel(type: string): string {
  if (/run/i.test(type)) return "Course à pied";
  if (/ride|bike|cycl/i.test(type)) return "Vélo";
  if (/swim/i.test(type)) return "Natation";
  return type;
}
