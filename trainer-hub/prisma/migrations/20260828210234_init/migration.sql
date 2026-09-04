-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'me',
    "firstName" TEXT,
    "birthDate" TEXT,
    "sex" TEXT,
    "weightKg" REAL,
    "hrMax" INTEGER,
    "hrRest" INTEGER,
    "lactateThresholdHr" INTEGER,
    "vma" REAL,
    "hrZonesJson" TEXT,
    "paceZonesJson" TEXT,
    "weeklyVolumeKm" REAL,
    "weeklySessionsTarget" INTEGER,
    "injuryHistory" TEXT,
    "onboardingCompletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "source" TEXT NOT NULL,
    "sourceId" TEXT,
    "stravaActivityId" BIGINT,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "sportType" TEXT,
    "startedAt" DATETIME NOT NULL,
    "startDay" TEXT NOT NULL,
    "distanceM" REAL NOT NULL,
    "movingTimeS" INTEGER NOT NULL,
    "elapsedTimeS" INTEGER NOT NULL,
    "elevationGainM" REAL,
    "avgSpeedMps" REAL,
    "maxSpeedMps" REAL,
    "avgHr" INTEGER,
    "maxHr" INTEGER,
    "avgCadence" REAL,
    "calories" REAL,
    "gapPaceSPerKm" REAL,
    "gapEstimated" BOOLEAN NOT NULL DEFAULT true,
    "trimp" REAL,
    "trimpMethod" TEXT,
    "decouplingPct" REAL,
    "hasHeartrate" BOOLEAN NOT NULL DEFAULT false,
    "hasStreams" BOOLEAN NOT NULL DEFAULT false,
    "metricsComputedAt" DATETIME,
    "deviceName" TEXT,
    "gearId" TEXT,
    "trainer" BOOLEAN NOT NULL DEFAULT false,
    "commute" BOOLEAN NOT NULL DEFAULT false,
    "rawSummaryJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ActivityStream" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "data" BLOB NOT NULL,
    "availableStreamsJson" TEXT NOT NULL,
    "pointCount" INTEGER NOT NULL,
    "fetchedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActivityStream_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BestEffort" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "durationS" INTEGER NOT NULL,
    "distanceM" REAL NOT NULL,
    "day" TEXT NOT NULL,
    CONSTRAINT "BestEffort_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "lapIndex" INTEGER NOT NULL,
    "name" TEXT,
    "distanceM" REAL NOT NULL,
    "elapsedTimeS" INTEGER NOT NULL,
    "movingTimeS" INTEGER NOT NULL,
    "elevationGainM" REAL,
    "avgSpeedMps" REAL,
    "maxSpeedMps" REAL,
    "avgHr" INTEGER,
    "maxHr" INTEGER,
    "avgCadence" REAL,
    "startedAt" DATETIME,
    "splitIndex" INTEGER,
    CONSTRAINT "Lap_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HealthMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "sleepDurationMin" INTEGER,
    "sleepDeepMin" INTEGER,
    "sleepRemMin" INTEGER,
    "sleepScore" INTEGER,
    "hrv" REAL,
    "restingHr" INTEGER,
    "weightKg" REAL,
    "recoveryStatusPct" INTEGER,
    "trainingLoadCoros" REAL,
    "source" TEXT NOT NULL,
    "importedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "JournalEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "overall" INTEGER,
    "fatigue" INTEGER,
    "motivation" INTEGER,
    "sleepQualitySubjective" INTEGER,
    "painsJson" TEXT NOT NULL DEFAULT '[]',
    "rpe" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShiftPattern" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL DEFAULT 'Cycle principal',
    "anchorDay" TEXT NOT NULL,
    "blocksJson" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ShiftCode" (
    "code" TEXT NOT NULL PRIMARY KEY,
    "label" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "isWork" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "ShiftException" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "code" TEXT,
    "note" TEXT,
    "isReplacement" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Goal" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "distanceM" REAL NOT NULL,
    "targetTimeS" INTEGER,
    "floorTimeS" INTEGER,
    "priority" TEXT NOT NULL DEFAULT 'A',
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "TrainingPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "goalId" TEXT,
    "name" TEXT NOT NULL,
    "startDay" TEXT NOT NULL,
    "endDay" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'active',
    "phasesJson" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "contextJson" TEXT,
    "rationale" TEXT,
    "generatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TrainingPlan_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlannedWorkout" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "structureJson" TEXT,
    "targetDurationS" INTEGER,
    "targetDistanceM" REAL,
    "targetPaceMinSPerKm" REAL,
    "targetPaceMaxSPerKm" REAL,
    "targetHrZone" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'upcoming',
    "isProvisional" BOOLEAN NOT NULL DEFAULT false,
    "isKeySession" BOOLEAN NOT NULL DEFAULT false,
    "fallbackDay" TEXT,
    "movedFromDay" TEXT,
    "activityId" TEXT,
    "orderInDay" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlannedWorkout_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TrainingPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PlannedWorkout_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PlanRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "planId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "weekStartDay" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "diffJson" TEXT,
    "model" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PlanRevision_planId_fkey" FOREIGN KEY ("planId") REFERENCES "TrainingPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "StravaAccount" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'strava',
    "athleteId" BIGINT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "scope" TEXT NOT NULL,
    "athleteName" TEXT,
    "webhookSubscriptionId" INTEGER,
    "lastSyncAt" DATETIME,
    "backfillCursor" TEXT,
    "backfillDone" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "payloadJson" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "runAfter" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL PRIMARY KEY,
    "valueJson" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Activity_stravaActivityId_key" ON "Activity"("stravaActivityId");

-- CreateIndex
CREATE INDEX "Activity_startDay_idx" ON "Activity"("startDay");

-- CreateIndex
CREATE INDEX "Activity_startedAt_idx" ON "Activity"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Activity_source_sourceId_key" ON "Activity"("source", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "ActivityStream_activityId_key" ON "ActivityStream"("activityId");

-- CreateIndex
CREATE INDEX "BestEffort_durationS_distanceM_idx" ON "BestEffort"("durationS", "distanceM");

-- CreateIndex
CREATE INDEX "BestEffort_day_idx" ON "BestEffort"("day");

-- CreateIndex
CREATE UNIQUE INDEX "BestEffort_activityId_durationS_key" ON "BestEffort"("activityId", "durationS");

-- CreateIndex
CREATE UNIQUE INDEX "Lap_activityId_lapIndex_key" ON "Lap"("activityId", "lapIndex");

-- CreateIndex
CREATE UNIQUE INDEX "HealthMetric_day_key" ON "HealthMetric"("day");

-- CreateIndex
CREATE UNIQUE INDEX "JournalEntry_day_key" ON "JournalEntry"("day");

-- CreateIndex
CREATE UNIQUE INDEX "ShiftException_day_key" ON "ShiftException"("day");

-- CreateIndex
CREATE INDEX "Goal_day_idx" ON "Goal"("day");

-- CreateIndex
CREATE UNIQUE INDEX "PlannedWorkout_activityId_key" ON "PlannedWorkout"("activityId");

-- CreateIndex
CREATE INDEX "PlannedWorkout_day_idx" ON "PlannedWorkout"("day");

-- CreateIndex
CREATE INDEX "PlannedWorkout_planId_day_idx" ON "PlannedWorkout"("planId", "day");

-- CreateIndex
CREATE INDEX "PlanRevision_planId_createdAt_idx" ON "PlanRevision"("planId", "createdAt");

-- CreateIndex
CREATE INDEX "SyncJob_status_runAfter_idx" ON "SyncJob"("status", "runAfter");
