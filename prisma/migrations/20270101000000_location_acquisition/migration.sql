-- Chantier (b1) · la location-acquisition chez le preneur (AUDCIF Titre VIII
-- ch. 8, auquel renvoie la fiche du compte 18 du SYCEBNL). Table neuve,
-- aucune ligne existante n'est réécrite.
CREATE TYPE "NatureLocationAcquisition" AS ENUM ('CREDIT_BAIL_IMMOBILIER', 'CREDIT_BAIL_MOBILIER', 'LOCATION_VENTE', 'AUTRE');
CREATE TYPE "PeriodiciteLoyer" AS ENUM ('MENSUELLE', 'TRIMESTRIELLE', 'SEMESTRIELLE', 'ANNUELLE');

CREATE TABLE "contrats_location_acquisition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "immobilisationId" TEXT NOT NULL,
    "bailleurTiersId" TEXT,
    "reference" TEXT,
    "nature" "NatureLocationAcquisition" NOT NULL,
    "dateConclusion" TIMESTAMP(3) NOT NULL,
    "datePriseEffet" TIMESTAMP(3) NOT NULL,
    "dureeMois" INTEGER NOT NULL,
    "periodicite" "PeriodiciteLoyer" NOT NULL,
    "termeAEchoir" BOOLEAN NOT NULL,
    "loyer" DECIMAL(18,2) NOT NULL,
    "prixOption" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "tauxAnnuel" DECIMAL(12,8),
    "valeurContrat" DECIMAL(18,2),
    "tauxPeriodique" DECIMAL(18,14) NOT NULL,
    "dette" DECIMAL(18,2) NOT NULL,
    "coutsDirects" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "avantagesRecus" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "optionRaisonnablementCertaine" BOOLEAN NOT NULL,
    "bienDeFaibleValeur" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "contrats_location_acquisition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "contrats_location_acquisition_immobilisationId_key" ON "contrats_location_acquisition"("immobilisationId");
CREATE INDEX "contrats_location_acquisition_tenantId_idx" ON "contrats_location_acquisition"("tenantId");
CREATE INDEX "contrats_location_acquisition_bailleurTiersId_idx" ON "contrats_location_acquisition"("bailleurTiersId");

ALTER TABLE "contrats_location_acquisition" ADD CONSTRAINT "contrats_location_acquisition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contrats_location_acquisition" ADD CONSTRAINT "contrats_location_acquisition_immobilisationId_fkey" FOREIGN KEY ("immobilisationId") REFERENCES "immobilisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "contrats_location_acquisition" ADD CONSTRAINT "contrats_location_acquisition_bailleurTiersId_fkey" FOREIGN KEY ("bailleurTiersId") REFERENCES "tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
