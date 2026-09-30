-- Droit des sociétés OHADA · passes O1a, O1b et D3.

-- AUSCGIE art. 386 et 414 · mode d'administration de la SA.
CREATE TYPE "ModeAdministrationSa" AS ENUM ('CONSEIL_ADMINISTRATION', 'ADMINISTRATEUR_GENERAL');
-- AUSCGIE art. 706 et 728 · remplacement et suppléant.
CREATE TYPE "NatureSuccessionMandat" AS ENUM ('REMPLACEMENT', 'SUPPLEANT');

-- Faits déclarés, tous nuls par défaut · rien n'est présumé.
ALTER TABLE "tenants" ADD COLUMN "modeAdministrationSa" "ModeAdministrationSa";
ALTER TABLE "tenants" ADD COLUMN "associeUniqueSas" BOOLEAN;
-- AUSCGIE art. 204 · la dissolution et les liquidateurs d'une société
-- commerciale se rangent dans "dateDissolution" et "liquidateurs", colonnes que
-- la migration 20261225000000_mentions_cooperative crée pour la coopérative
-- (AUSCOOP art. 183) · même fait, mêmes colonnes, elles ne sont pas recréées ici.
ALTER TABLE "tenants" ADD COLUMN "formeJuridiqueSyscohadaAnterieure" "FormeJuridiqueSyscohada";
ALTER TABLE "tenants" ADD COLUMN "dateTransformationForme" TIMESTAMP(3);

ALTER TABLE "mandats_auditeur" ADD COLUMN "mandatOrigineId" TEXT;
ALTER TABLE "mandats_auditeur" ADD COLUMN "natureSuccession" "NatureSuccessionMandat";
CREATE INDEX "mandats_auditeur_mandatOrigineId_idx" ON "mandats_auditeur"("mandatOrigineId");
ALTER TABLE "mandats_auditeur" ADD CONSTRAINT "mandats_auditeur_mandatOrigineId_fkey"
  FOREIGN KEY ("mandatOrigineId") REFERENCES "mandats_auditeur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
