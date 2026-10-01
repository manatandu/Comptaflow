-- Amortissement exceptionnel (loi n° 23/053, art. 36 à 38) · variante de
-- l'option dégressive, avec la déclaration de l'art. 36 gardée sur le bien.
ALTER TABLE "immobilisations" ADD COLUMN "amortissementExceptionnel" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "immobilisations" ADD COLUMN "chiffreAffairesExportHt" DECIMAL(18,2);
ALTER TABLE "immobilisations" ADD COLUMN "chiffreAffairesTotalHt" DECIMAL(18,2);
ALTER TABLE "immobilisations" ADD COLUMN "sourceChiffreAffairesExport" TEXT;
