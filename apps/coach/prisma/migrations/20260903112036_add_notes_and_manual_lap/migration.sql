-- AlterTable
ALTER TABLE "Activity" ADD COLUMN "notes" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Lap" (
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
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Lap_activityId_fkey" FOREIGN KEY ("activityId") REFERENCES "Activity" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Lap" ("activityId", "avgCadence", "avgHr", "avgSpeedMps", "distanceM", "elapsedTimeS", "elevationGainM", "id", "lapIndex", "maxHr", "maxSpeedMps", "movingTimeS", "name", "splitIndex", "startedAt") SELECT "activityId", "avgCadence", "avgHr", "avgSpeedMps", "distanceM", "elapsedTimeS", "elevationGainM", "id", "lapIndex", "maxHr", "maxSpeedMps", "movingTimeS", "name", "splitIndex", "startedAt" FROM "Lap";
DROP TABLE "Lap";
ALTER TABLE "new_Lap" RENAME TO "Lap";
CREATE UNIQUE INDEX "Lap_activityId_lapIndex_key" ON "Lap"("activityId", "lapIndex");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
