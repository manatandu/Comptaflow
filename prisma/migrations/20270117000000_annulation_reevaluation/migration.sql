-- Ligne A6, décision D6 (2026-10-03) · une réévaluation des devises
-- s'ANNULE (AUDCIF art. 20, al. 2), jamais ne se supprime · elle garde la
-- date, l'auteur, le motif, et ce que l'annulation a fait de ses écritures.
ALTER TABLE "reevaluations" ADD COLUMN "annuleeLe" TIMESTAMP(3);
ALTER TABLE "reevaluations" ADD COLUMN "annuleePar" TEXT;
ALTER TABLE "reevaluations" ADD COLUMN "motifAnnulation" TEXT;
ALTER TABLE "reevaluations" ADD COLUMN "annulation" JSONB;

-- Une seule réévaluation NON ANNULÉE par exercice · l'index unique sur
-- (dossier, exercice) devient (dossier, exercice, annuleeLe) et tient deux
-- NULL pour ÉGAUX · les annulées, datées, s'y ajoutent sans le rompre.
DROP INDEX "reevaluations_tenantId_exerciceId_key";
CREATE UNIQUE INDEX "reevaluations_tenantId_exerciceId_annuleeLe_key"
  ON "reevaluations"("tenantId", "exerciceId", "annuleeLe") NULLS NOT DISTINCT;
