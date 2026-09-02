-- Le chrono visé devient une fourchette (borne basse / borne haute) plutôt
-- qu'un point unique. Les lignes existantes sont préservées : leur ancien
-- `targetTimeS` devient à la fois la borne basse et la borne haute — un
-- objectif est réaffiché sans fourchette tant qu'il n'a pas été élargi
-- manuellement, jamais une fourchette inventée à partir d'un seul chiffre.
ALTER TABLE "Goal" ADD COLUMN "targetTimeMinS" INTEGER;
ALTER TABLE "Goal" ADD COLUMN "targetTimeMaxS" INTEGER;

UPDATE "Goal"
SET "targetTimeMinS" = "targetTimeS",
    "targetTimeMaxS" = "targetTimeS"
WHERE "targetTimeS" IS NOT NULL;

ALTER TABLE "Goal" DROP COLUMN "targetTimeS";
