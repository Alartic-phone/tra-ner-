import type { Prisma } from "@prisma/client";
import { toDay } from "../time.ts";
import type { StravaActivitySummary } from "./schemas.ts";

/**
 * Traduction d'une activité Strava vers le modèle interne.
 *
 * Règle appliquée strictement : aucun champ n'est comblé par une valeur par
 * défaut. Une fréquence cardiaque absente reste nulle, elle ne devient pas 0 —
 * sans quoi les moyennes et la charge seraient fausses sans que rien ne le
 * signale.
 */
export function toActivityData(
  a: StravaActivitySummary,
): Prisma.ActivityUncheckedCreateInput {
  const startedAt = new Date(a.start_date);

  return {
    source: "strava",
    sourceId: String(a.id),
    stravaActivityId: BigInt(a.id),
    name: a.name,
    type: a.type,
    sportType: a.sport_type ?? null,
    startedAt,
    startDay: toDay(startedAt),
    distanceM: a.distance,
    movingTimeS: a.moving_time,
    elapsedTimeS: a.elapsed_time,
    elevationGainM: a.total_elevation_gain ?? null,
    avgSpeedMps: a.average_speed ?? null,
    maxSpeedMps: a.max_speed ?? null,
    avgHr: a.average_heartrate != null ? Math.round(a.average_heartrate) : null,
    maxHr: a.max_heartrate != null ? Math.round(a.max_heartrate) : null,
    avgCadence: a.average_cadence ?? null,
    calories: a.calories ?? null,
    hasHeartrate: a.has_heartrate ?? a.average_heartrate != null,
    deviceName: a.device_name ?? null,
    gearId: a.gear_id ?? null,
    trainer: a.trainer ?? false,
    commute: a.commute ?? false,
    rawSummaryJson: JSON.stringify(a),
  };
}

/** Types Strava considérés comme de la course à pied. */
export const RUN_TYPES = new Set(["Run", "TrailRun", "VirtualRun"]);

export function isRun(type: string): boolean {
  return RUN_TYPES.has(type);
}

/** Types Strava considérés comme du vélo. */
export const RIDE_TYPES = new Set(["Ride", "VirtualRide", "EBikeRide", "Velomobile"]);

export function isRide(type: string): boolean {
  return RIDE_TYPES.has(type);
}
