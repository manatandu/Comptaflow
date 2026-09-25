-- Point 16 de la comparaison Sage i7 · capital social (AUSCGIE art. 17 et 269-2), courriel et site de l'entité.
-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "capitalSocial" DECIMAL(18,2),
ADD COLUMN     "capitalVariable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "siteWeb" TEXT;

