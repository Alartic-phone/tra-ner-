-- CreateTable
CREATE TABLE "BestEffortByDistance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "activityId" TEXT NOT NULL,
    "distanceM" REAL NOT NULL,
    "durationS" INTEGER NOT NULL,
    "day" TEXT NOT NULL,
    CONSTRAINT "BestEffortByDistance_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "BestEffortByDistance_distanceM_durationS_idx" ON "BestEffortByDistance"("distanceM", "durationS");

-- CreateIndex
CREATE INDEX "BestEffortByDistance_day_idx" ON "BestEffortByDistance"("day");

-- CreateIndex
CREATE UNIQUE INDEX "BestEffortByDistance_activityId_distanceM_key" ON "BestEffortByDistance"("activityId", "distanceM");
