-- CreateTable
CREATE TABLE "ImportedPlanSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "day" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "distanceM" REAL,
    "durationS" INTEGER,
    "hrTargetMinBpm" INTEGER,
    "hrTargetMaxBpm" INTEGER,
    "zoneLabel" TEXT,
    "objective" TEXT NOT NULL,
    "muscuDetails" TEXT,
    "fractionneDetails" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "ImportedPlanSession_day_idx" ON "ImportedPlanSession"("day");

-- CreateIndex
CREATE UNIQUE INDEX "ImportedPlanSession_day_objective_key" ON "ImportedPlanSession"("day", "objective");
