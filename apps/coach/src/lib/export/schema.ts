import { z } from "zod";

/**
 * Schéma Zod du JSON d'export — la même forme sert à valider ce qu'on
 * écrit ET documente ce que lira un tiers (coach humain ou modèle) qui
 * reçoit le fichier. `schemaVersion` change à toute évolution de forme
 * incompatible.
 */

export const EXPORT_SCHEMA_VERSION = "1.0.0";

const dayString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const exportMetaSchema = z.object({
  schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
  exportedAt: dayString,
  periodFrom: dayString,
  periodTo: dayString,
  scope: z.string(),
  timezone: z.literal("Europe/Paris"),
  counts: z.object({ activities: z.number().int(), healthDays: z.number().int(), weeks: z.number().int() }),
  notation: z.object({ estimated: z.string(), unavailable: z.string() }),
});

export const exportProfileSchema = z.object({
  firstName: z.string().nullable(),
  hrMax: z.number().nullable(),
  hrRest: z.number().nullable(),
  sex: z.string().nullable(),
  weightKg: z.number().nullable(),
  vma: z.number().nullable(),
  hrZones: z
    .array(z.object({ index: z.number(), name: z.string(), fromBpm: z.number(), toBpm: z.number() }))
    .nullable(),
  paceZones: z
    .array(
      z.object({
        name: z.string(),
        fromVmaPct: z.number(),
        toVmaPct: z.number(),
        fastestSPerKm: z.number(),
        slowestSPerKm: z.number(),
      }),
    )
    .nullable(),
});

export const exportShiftDaySchema = z.object({
  day: dayString,
  code: z.string().nullable(),
  label: z.string(),
  isException: z.boolean(),
  isReplacement: z.boolean(),
});

export const exportShiftsSchema = z.object({
  cycleAnchorDay: dayString,
  blocks: z.array(z.object({ sequence: z.string(), restDays: z.number() })),
  days: z.array(exportShiftDaySchema),
  replacements: z.array(z.object({ day: dayString, code: z.string().nullable(), note: z.string().nullable() })),
});

export const exportWeekSchema = z.object({
  weekStart: dayString,
  weekEnd: dayString,
  runKm: z.number(),
  rideKm: z.number(),
  sessions: z.number().int(),
  elevationM: z.number(),
  durationS: z.number(),
  trimp: z.number().nullable(),
  ctlEnd: z.number().nullable(),
  atlEnd: z.number().nullable(),
  tsbEnd: z.number().nullable(),
  zonePct: z.record(z.string(), z.number()).nullable(),
});

export const exportActivitySchema = z.object({
  id: z.string(),
  day: dayString,
  name: z.string(),
  type: z.string(),
  distanceM: z.number(),
  movingTimeS: z.number(),
  elevationGainM: z.number().nullable(),
  avgHr: z.number().nullable(),
  maxHr: z.number().nullable(),
  avgSpeedMps: z.number().nullable(),
  trimp: z.number().nullable(),
  trimpEstimated: z.boolean(),
  gapPaceSPerKm: z.number().nullable(),
  gapEstimated: z.boolean(),
  decouplingPct: z.number().nullable(),
  hasStreams: z.boolean(),
  hasHeartrate: z.boolean(),
});

export const exportActivityDetailSchema = z.object({
  activityId: z.string(),
  splits: z.array(
    z.object({ index: z.number(), distanceM: z.number(), movingTimeS: z.number(), avgHr: z.number().nullable() }),
  ),
  laps: z.array(
    z.object({
      index: z.number(),
      distanceM: z.number(),
      movingTimeS: z.number(),
      avgHr: z.number().nullable(),
      isManual: z.boolean(),
    }),
  ),
  zoneSecondsByZone: z.array(z.number()).nullable(),
  bestEfforts: z.array(z.object({ durationS: z.number(), distanceM: z.number() })),
});

export const exportHealthDaySchema = z.object({
  day: dayString,
  hrv: z.number().nullable(),
  restingHr: z.number().nullable(),
  sleepDurationMin: z.number().nullable(),
  sleepDeepMin: z.number().nullable(),
  sleepScore: z.number().nullable(),
  recoveryStatusPct: z.number().nullable(),
});

export const exportRecordSchema = z.object({
  label: z.string(),
  value: z.number().nullable(),
  unit: z.string(),
  day: dayString.nullable(),
  estimated: z.boolean(),
});

export const exportPlanSchema = z.object({
  goal: z
    .object({
      name: z.string(),
      day: dayString,
      distanceM: z.number(),
      targetTimeMinS: z.number().nullable(),
      targetTimeMaxS: z.number().nullable(),
    })
    .nullable(),
  workouts: z.array(
    z.object({
      day: dayString,
      title: z.string(),
      type: z.string(),
      status: z.string(),
      targetDistanceM: z.number().nullable(),
      targetDurationS: z.number().nullable(),
      activityId: z.string().nullable(),
    }),
  ),
});

export const exportQualitySchema = z.object({
  daysWithoutHealthMetric: z.number().int(),
  activitiesWithoutHr: z.number().int(),
  activitiesWithoutGps: z.number().int(),
  suspectedDuplicates: z.array(z.object({ a: z.string(), b: z.string() })),
  estimatedFields: z.array(z.string()),
  periodsWithoutShift: z.array(z.string()),
});

export const exportDataSchema = z.object({
  meta: exportMetaSchema,
  profile: exportProfileSchema,
  shifts: exportShiftsSchema,
  weeks: z.array(exportWeekSchema),
  activities: z.array(exportActivitySchema),
  activityDetails: z.array(exportActivityDetailSchema),
  health: z.array(exportHealthDaySchema),
  records: z.array(exportRecordSchema),
  plan: exportPlanSchema,
  quality: exportQualitySchema,
});

export type ExportData = z.infer<typeof exportDataSchema>;
