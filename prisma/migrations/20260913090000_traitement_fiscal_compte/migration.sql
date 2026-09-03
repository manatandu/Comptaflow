-- TRAITEMENT FISCAL DÉCLARÉ PAR COMPTE.
--
-- Code du catalogue des retraitements fiscaux, posé par le cabinet sur ses
-- propres sous-comptes. Sans clé étrangère : le catalogue est une table de
-- code (catalogue-retraitements.ts), pas une table de base. Un code inconnu
-- est refusé à l'écriture par le service et ignoré à la lecture.
ALTER TABLE "comptes" ADD COLUMN "codeRetraitementFiscal" TEXT;

-- Le résultat fiscal ne cherche que les comptes qui portent un code. Index
-- ORDINAIRE et non partiel : Prisma ne sait pas déclarer de clause WHERE, et
-- une migration que le schéma ne peut pas exprimer dérive en silence
-- (CLAUDE.md §6 bis).
CREATE INDEX "comptes_tenantId_codeRetraitementFiscal_idx"
  ON "comptes"("tenantId", "codeRetraitementFiscal");
