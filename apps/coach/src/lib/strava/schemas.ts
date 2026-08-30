import { z } from "zod";

/**
 * Schémas de validation des réponses de l'API Strava.
 *
 * Toute réponse externe est validée avant d'entrer dans l'application : une
 * API tierce peut changer, renvoyer un champ nul là où on attendait un
 * nombre, ou tronquer un objet. On préfère une erreur explicite à une valeur
 * silencieusement fausse dans les calculs de charge.
 */

export const tokenResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_at: z.number(),
  token_type: z.string().optional(),
  scope: z.string().optional(),
  athlete: z
    .object({
      id: z.number(),
      firstname: z.string().nullable().optional(),
      lastname: z.string().nullable().optional(),
    })
    .optional(),
});

export type StravaTokenResponse = z.infer<typeof tokenResponseSchema>;

/** Résumé d'activité tel que renvoyé par /athlete/activities. */
export const activitySummarySchema = z.object({
  id: z.number(),
  name: z.string(),
  type: z.string(),
  sport_type: z.string().optional(),
  start_date: z.string(),
  start_date_local: z.string().optional(),
  timezone: z.string().optional(),
  distance: z.number(),
  moving_time: z.number(),
  elapsed_time: z.number(),
  total_elevation_gain: z.number().nullable().optional(),
  average_speed: z.number().nullable().optional(),
  max_speed: z.number().nullable().optional(),
  average_heartrate: z.number().nullable().optional(),
  max_heartrate: z.number().nullable().optional(),
  average_cadence: z.number().nullable().optional(),
  calories: z.number().nullable().optional(),
  has_heartrate: z.boolean().optional(),
  device_name: z.string().nullable().optional(),
  gear_id: z.string().nullable().optional(),
  trainer: z.boolean().optional(),
  commute: z.boolean().optional(),
});

export type StravaActivitySummary = z.infer<typeof activitySummarySchema>;

export const activityListSchema = z.array(activitySummarySchema);

export const lapSchema = z.object({
  id: z.number().optional(),
  lap_index: z.number(),
  name: z.string().nullable().optional(),
  distance: z.number(),
  elapsed_time: z.number(),
  moving_time: z.number(),
  total_elevation_gain: z.number().nullable().optional(),
  average_speed: z.number().nullable().optional(),
  max_speed: z.number().nullable().optional(),
  average_heartrate: z.number().nullable().optional(),
  max_heartrate: z.number().nullable().optional(),
  average_cadence: z.number().nullable().optional(),
  start_date: z.string().nullable().optional(),
  split: z.number().nullable().optional(),
});

export const activityDetailSchema = activitySummarySchema.extend({
  laps: z.array(lapSchema).nullable().optional(),
  description: z.string().nullable().optional(),
});

/** Flux temporels. Chaque clé est optionnelle : un capteur peut manquer. */
export const streamSetSchema = z.object({
  time: z.object({ data: z.array(z.number()) }).optional(),
  heartrate: z.object({ data: z.array(z.number().nullable()) }).optional(),
  velocity_smooth: z.object({ data: z.array(z.number().nullable()) }).optional(),
  altitude: z.object({ data: z.array(z.number().nullable()) }).optional(),
  cadence: z.object({ data: z.array(z.number().nullable()) }).optional(),
  distance: z.object({ data: z.array(z.number().nullable()) }).optional(),
  // Paires [lat, lng], pas un nombre seul — forme différente des autres flux.
  latlng: z
    .object({ data: z.array(z.tuple([z.number(), z.number()]).nullable()) })
    .optional(),
});

export type StravaStreamSet = z.infer<typeof streamSetSchema>;

export const STREAM_KEYS = [
  "time",
  "heartrate",
  "velocity_smooth",
  "altitude",
  "cadence",
  "distance",
  "latlng",
] as const;

export const webhookEventSchema = z.object({
  object_type: z.enum(["activity", "athlete"]),
  object_id: z.number(),
  aspect_type: z.enum(["create", "update", "delete"]),
  owner_id: z.number(),
  subscription_id: z.number().optional(),
  event_time: z.number().optional(),
  updates: z.record(z.string(), z.unknown()).optional(),
});
