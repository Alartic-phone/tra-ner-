-- Remplace la clé d'idempotence (day, objective) par (day, orderInDay) :
-- deux séances du même jour partageant le même objectif (souvent vide —
-- musculation + course le même jour) s'écrasaient silencieusement l'une
-- l'autre. En trois temps, sans jamais perdre une ligne existante.

-- Étape 1 : ajouter la colonne avec une valeur par défaut temporaire (0).
-- Provisoire : chaque ligne existante reçoit un vrai rang à l'étape 2.
ALTER TABLE "ImportedPlanSession" ADD COLUMN "orderInDay" INTEGER NOT NULL DEFAULT 0;

-- Étape 2 : remplir les lignes existantes — rang croissant par jour,
-- départagé par createdAt puis id, à partir de 0. Sous-requête corrélée
-- (comptage des lignes "antérieures" du même jour) plutôt qu'une fonction
-- fenêtrée, pour rester portable sur toute version de SQLite embarquée.
UPDATE "ImportedPlanSession"
SET "orderInDay" = (
  SELECT COUNT(*)
  FROM "ImportedPlanSession" AS earlier
  WHERE earlier."day" = "ImportedPlanSession"."day"
    AND (
      earlier."createdAt" < "ImportedPlanSession"."createdAt"
      OR (earlier."createdAt" = "ImportedPlanSession"."createdAt" AND earlier."id" < "ImportedPlanSession"."id")
    )
);

-- Étape 3 : remplacer l'ancienne clé d'idempotence par la nouvelle.
DROP INDEX "ImportedPlanSession_day_objective_key";
CREATE UNIQUE INDEX "ImportedPlanSession_day_orderInDay_key" ON "ImportedPlanSession"("day", "orderInDay");
