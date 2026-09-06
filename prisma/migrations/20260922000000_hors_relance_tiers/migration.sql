-- Exclusion d'un tiers du circuit de relance · l'exclusion porte sur le
-- COURRIER, jamais sur la créance : aucun état qui recense l'ouvert ne lit ces
-- colonnes.
ALTER TABLE "tiers" ADD COLUMN "horsRelance" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tiers" ADD COLUMN "motifHorsRelance" TEXT;
ALTER TABLE "tiers" ADD COLUMN "horsRelanceDepuis" TIMESTAMP(3);
