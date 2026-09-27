-- Audit final F38 · la ligne ANNUELLE d'un budget (mois nul) est unique par
-- section et par exercice. Un index unique ordinaire tient deux NULL pour
-- distincts : il ne protégeait rien sur cette ligne, et la retouche d'un mois
-- ne pouvait pas l'atteindre par sa clé.

-- 1. Doublons éventuels de la ligne annuelle · une seule est gardée.
DELETE FROM "budgets_section" b
USING "budgets_section" a
WHERE b."mois" IS NULL
  AND a."mois" IS NULL
  AND a."sectionId" = b."sectionId"
  AND a."exerciceId" = b."exerciceId"
  AND a."id" < b."id";

-- 2. L'annuelle suit la somme des mois là où des mois existent · c'est la
-- règle de la retouche, qu'une retouche interrompue a pu laisser en défaut.
UPDATE "budgets_section" a
SET "montant" = m.total
FROM (
  SELECT "sectionId", "exerciceId", SUM("montant") AS total
  FROM "budgets_section"
  WHERE "mois" IS NOT NULL
  GROUP BY "sectionId", "exerciceId"
) m
WHERE a."mois" IS NULL
  AND a."sectionId" = m."sectionId"
  AND a."exerciceId" = m."exerciceId";

-- 3. Le même index, qui tient désormais deux NULL pour égaux.
DROP INDEX "budgets_section_sectionId_exerciceId_mois_key";
CREATE UNIQUE INDEX "budgets_section_sectionId_exerciceId_mois_key"
  ON "budgets_section"("sectionId", "exerciceId", "mois") NULLS NOT DISTINCT;
