import { z } from "zod";

/**
 * Schéma de la donnée d'export — la même structure alimente le Markdown, le
 * JSON et le CSV : chaque renderer part de cet objet unique déjà collecté et
 * validé, aucun ne retourne en base. `EXPORT_SCHEMA_VERSION` s'incrémente à
 * toute modification de forme, jamais de contenu : un vieux fichier JSON doit
 * pouvoir être identifié sans l'ouvrir.
 *
 * Convention de notation, rappelée dans les métadonnées de chaque export et
 * strictement respectée par les renderers : "[est]" marque une valeur
 * obtenue par approximation, "non disponible" une mesure absente. Jamais de
 * zéro silencieux à la place de l'un ou l'autre.
 */

export const EXPORT_SCHEMA_VERSION = 1;

export const exportMetadataSchema = z.object({
  schemaVersion: z.literal(EXPORT_SCHEMA_VERSION),
  exportedAt: z.string(),
  timezone: z.literal("Europe/Paris"),
  period: z.object({ from: z.string(), to: z.string() }),
  counts: z.object({
    activities: z.number().int(),
    healthDays: z.number().int(),
    plannedWorkouts: z.number().int(),
  }),
  sources: z.array(z.string()),
  notation: z.object({
    estimated: z.literal("[est]"),
    unavailable: z.literal("non disponible"),
  }),
});
export type ExportMetadata = z.infer<typeof exportMetadataSchema>;

// ---------------------------------------------------------------------------
// 1. Profil et zones
// ---------------------------------------------------------------------------

export const exportHrZoneSchema = z.object({
  index: z.number().int(),
  name: z.string(),
  fromBpm: z.number(),
  toBpm: z.number(),
});

export const exportPaceZoneSchema = z.object({
  name: z.string(),
  fromVmaPct: z.number(),
  toVmaPct: z.number(),
  slowestSPerKm: z.number(),
  fastestSPerKm: z.number(),
});

export const exportProfileSchema = z.object({
  ageYears: z.number().int().nullable(),
  /** Aucun champ de taille dans le modèle de données actuel — toujours "non disponible". */
  heightCm: z.number().nullable(),
  weight: z.object({ kg: z.number(), measuredOn: z.string().nullable() }).nullable(),
  hrMax: z.number().int().nullable(),
  hrRest: z.number().int().nullable(),
  lactateThresholdHr: z.number().int().nullable(),
  zoneMethod: z.string(),
  hrZones: z.array(exportHrZoneSchema),
  vmaKmh: z.number().nullable(),
  paceZones: z.array(exportPaceZoneSchema),
});
export type ExportProfile = z.infer<typeof exportProfileSchema>;

// ---------------------------------------------------------------------------
// 2. Postes
// ---------------------------------------------------------------------------

export const exportShiftDaySchema = z.object({
  day: z.string(),
  code: z.string().nullable(),
  label: z.string().nullable(),
  startTime: z.string().nullable(),
  endTime: z.string().nullable(),
  windows: z.array(z.object({ start: z.string(), end: z.string() })),
  isException: z.boolean(),
  isReplacement: z.boolean(),
});

export const exportReplacementSchema = z.object({
  day: z.string(),
  code: z.string().nullable(),
  note: z.string().nullable(),
  isReplacement: z.boolean(),
});

export const exportShiftsSchema = z.object({
  cycleAnchorDay: z.string(),
  blocks: z.array(z.object({ sequence: z.string(), restDays: z.number().int() })),
  days: z.array(exportShiftDaySchema),
  replacements: z.array(exportReplacementSchema),
});
export type ExportShifts = z.infer<typeof exportShiftsSchema>;

// ---------------------------------------------------------------------------
// 3. Semaines
// ---------------------------------------------------------------------------

export const exportWeekRowSchema = z.object({
  weekStart: z.string(),
  weekEnd: z.string(),
  runKm: z.number(),
  rideKm: z.number(),
  otherSports: z.array(z.object({ sport: z.string(), km: z.number() })),
  sessions: z.number().int(),
  elevationGainM: z.number(),
  totalTimeS: z.number().int(),
  trimpTotal: z.number().nullable(),
  ctl: z.number().nullable(),
  atl: z.number().nullable(),
  tsb: z.number().nullable(),
  zoneDistributionPct: z.array(z.object({ zone: z.number().int(), pct: z.number() })).nullable(),
});
export type ExportWeekRow = z.infer<typeof exportWeekRowSchema>;

// ---------------------------------------------------------------------------
// 4. Activités
// ---------------------------------------------------------------------------

export const exportActivityRowSchema = z.object({
  id: z.string(),
  day: z.string(),
  time: z.string().nullable(),
  sport: z.string(),
  name: z.string(),
  distanceM: z.number(),
  movingTimeS: z.number().int(),
  elapsedTimeS: z.number().int(),
  avgSpeedMps: z.number().nullable(),
  avgHr: z.number().int().nullable(),
  maxHr: z.number().int().nullable(),
  elevationGainM: z.number().nullable(),
  avgCadence: z.number().nullable(),
  calories: z.number().nullable(),
  trimp: z.number().nullable(),
  trimpEstimated: z.boolean(),
  shiftCode: z.string().nullable(),
  source: z.string(),
});
export type ExportActivityRow = z.infer<typeof exportActivityRowSchema>;

// ---------------------------------------------------------------------------
// 5. Détail des activités marquantes
// ---------------------------------------------------------------------------

export const exportSplitSchema = z.object({
  index: z.number().int(),
  distanceM: z.number(),
  timeS: z.number(),
  paceSPerKm: z.number().nullable(),
  avgHr: z.number().nullable(),
  elevGainM: z.number().nullable(),
  elevLossM: z.number().nullable(),
  partial: z.boolean(),
});

export const exportLapSchema = z.object({
  lapIndex: z.number().int(),
  name: z.string().nullable(),
  distanceM: z.number(),
  movingTimeS: z.number().int(),
  avgSpeedMps: z.number().nullable(),
  avgHr: z.number().int().nullable(),
  maxHr: z.number().int().nullable(),
});

export const exportActivityDetailSchema = z.object({
  activityId: z.string(),
  splits: z.array(exportSplitSchema),
  laps: z.array(exportLapSchema),
  zoneSeconds: z.array(z.object({ zone: z.number().int(), seconds: z.number() })).nullable(),
  decouplingPct: z.number().nullable(),
  bestEfforts: z.array(z.object({ durationS: z.number().int(), distanceM: z.number() })),
});
export type ExportActivityDetail = z.infer<typeof exportActivityDetailSchema>;

// ---------------------------------------------------------------------------
// 6. Santé quotidienne
// ---------------------------------------------------------------------------

export const exportHealthRowSchema = z.object({
  day: z.string(),
  hrv: z.number().nullable(),
  /** Bornes de la plage travaillée du jour (poste résolu), pas une donnée santé. */
  shiftWindow: z.object({ code: z.string().nullable(), start: z.string(), end: z.string() }).nullable(),
  restingHr: z.number().int().nullable(),
  sleepDurationMin: z.number().int().nullable(),
  sleepScore: z.number().int().nullable(),
  sleepDeepPct: z.number().nullable(),
  naps: z.null(),
});
export type ExportHealthRow = z.infer<typeof exportHealthRowSchema>;

// ---------------------------------------------------------------------------
// 7. Records
// ---------------------------------------------------------------------------

export const exportRecordSchema = z.object({
  durationS: z.number().int(),
  distanceM: z.number(),
  day: z.string(),
  activityId: z.string(),
});

export const exportRecordsSchema = z.object({
  byDuration: z.array(exportRecordSchema),
  longestRunProgression: z.array(z.object({ day: z.string(), distanceM: z.number() })),
});
export type ExportRecords = z.infer<typeof exportRecordsSchema>;

// ---------------------------------------------------------------------------
// 8. Plan
// ---------------------------------------------------------------------------

export const exportPlannedWorkoutSchema = z.object({
  day: z.string(),
  type: z.string(),
  title: z.string(),
  targetDistanceM: z.number().nullable(),
  targetHrZone: z.number().int().nullable(),
  status: z.string(),
  realized: z
    .object({
      activityId: z.string(),
      distanceM: z.number(),
      distanceDeltaPct: z.number().nullable(),
      avgHr: z.number().int().nullable(),
      inTargetZone: z.boolean().nullable(),
    })
    .nullable(),
});

export const exportPlanSchema = z.object({
  activeGoal: z
    .object({ name: z.string(), day: z.string(), distanceM: z.number(), targetTimeS: z.number().nullable() })
    .nullable(),
  workouts: z.array(exportPlannedWorkoutSchema),
});
export type ExportPlan = z.infer<typeof exportPlanSchema>;

// ---------------------------------------------------------------------------
// 9. Qualité des données
// ---------------------------------------------------------------------------

export const exportQualitySchema = z.object({
  healthDaysMissing: z.number().int(),
  healthDaysTotal: z.number().int(),
  activitiesWithoutHr: z.number().int(),
  activitiesWithoutGps: z.number().int(),
  suspectedDuplicates: z.array(
    z.object({ activityIds: z.tuple([z.string(), z.string()]), day: z.string(), gapMinutes: z.number() }),
  ),
  estimatedFields: z.array(z.string()),
  shiftsUnconfiguredDays: z.number().int(),
});
export type ExportQuality = z.infer<typeof exportQualitySchema>;

// ---------------------------------------------------------------------------
// Racine
// ---------------------------------------------------------------------------

export const exportDataSchema = z.object({
  metadata: exportMetadataSchema,
  profile: exportProfileSchema.nullable(),
  shifts: exportShiftsSchema.nullable(),
  weeks: z.array(exportWeekRowSchema).nullable(),
  activities: z.array(exportActivityRowSchema).nullable(),
  activityDetails: z.array(exportActivityDetailSchema),
  health: z.array(exportHealthRowSchema).nullable(),
  records: exportRecordsSchema.nullable(),
  plan: exportPlanSchema.nullable(),
  quality: exportQualitySchema.nullable(),
  /** Flux bruts, uniquement pour les activités explicitement sélectionnées en JSON. */
  streams: z
    .array(
      z.object({
        activityId: z.string(),
        time: z.array(z.number()).optional(),
        heartrate: z.array(z.number().nullable()).optional(),
        velocity_smooth: z.array(z.number().nullable()).optional(),
        altitude: z.array(z.number().nullable()).optional(),
        cadence: z.array(z.number().nullable()).optional(),
        distance: z.array(z.number().nullable()).optional(),
        latlng: z.array(z.tuple([z.number(), z.number()]).nullable()).optional(),
      }),
    )
    .nullable(),
});
export type ExportData = z.infer<typeof exportDataSchema>;
