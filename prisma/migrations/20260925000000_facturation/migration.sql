-- FACTURATION · la pièce que la loi exige pour chaque transaction.
--
-- LPF art. 23 (obligation de facturer), décret n° 011/42 art. 100 (les neuf
-- groupes de mentions obligatoires, dont trois ne se lisent que sur des
-- lignes), O.-L. n° 10/001 art. 56 (l'état détaillé, condition du droit à
-- déduction, construit de ces mêmes lignes).
--
-- Aucune donnée existante n'est touchée : deux tables neuves et un enum. Une
-- écriture déjà passée reste sans facture, et c'est l'état vrai.

-- CreateEnum
CREATE TYPE "SensFacture" AS ENUM ('VENTE', 'ACHAT');

-- CreateTable
CREATE TABLE "factures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sens" "SensFacture" NOT NULL,
    "numeroSerie" TEXT NOT NULL,
    "dateFacture" TIMESTAMP(3) NOT NULL,
    "tiersId" TEXT,
    "emetteurNom" TEXT NOT NULL,
    "emetteurNumeroImpot" TEXT,
    "contrepartieNom" TEXT NOT NULL,
    "contrepartieNumeroImpot" TEXT,
    "mentionTvaDebits" BOOLEAN NOT NULL DEFAULT false,
    "ecritureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "factures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_facture" (
    "id" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "designation" TEXT NOT NULL,
    "quantite" DECIMAL(18,4) NOT NULL,
    "prixUnitaire" DECIMAL(18,2) NOT NULL,
    "montantHT" DECIMAL(18,2) NOT NULL,
    "imposable" BOOLEAN NOT NULL DEFAULT true,
    "tauxTvaId" TEXT,
    "tauxApplique" DECIMAL(5,2),
    "montantTva" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "lignes_facture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "factures_ecritureId_key" ON "factures"("ecritureId");

-- CreateIndex
CREATE INDEX "factures_tenantId_sens_dateFacture_idx" ON "factures"("tenantId", "sens", "dateFacture");

-- CreateIndex
CREATE UNIQUE INDEX "factures_tenantId_sens_numeroSerie_key" ON "factures"("tenantId", "sens", "numeroSerie");

-- CreateIndex
CREATE UNIQUE INDEX "lignes_facture_factureId_ordre_key" ON "lignes_facture"("factureId", "ordre");

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_tiersId_fkey" FOREIGN KEY ("tiersId") REFERENCES "tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_facture" ADD CONSTRAINT "lignes_facture_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_facture" ADD CONSTRAINT "lignes_facture_tauxTvaId_fkey" FOREIGN KEY ("tauxTvaId") REFERENCES "taux_tva"("id") ON DELETE SET NULL ON UPDATE CASCADE;
