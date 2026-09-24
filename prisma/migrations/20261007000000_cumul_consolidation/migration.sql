-- Consolidation SYSCOHADA, tranche 2 · cumul et éliminations (AUDCIF art. 80 à 86, D4C ch. XII-5 et XII-6).
-- Les données d'acquisition sur chaque participation, la balance retraitée de chaque entité,
-- et les comptes réciproques déclarés après confirmation de solde.

-- CreateEnum
CREATE TYPE "ModeDureeEcartAcquisition" AS ENUM ('LIMITEE', 'NON_DETERMINABLE');

-- AlterTable
ALTER TABLE "entites_perimetre_consolidation" ADD COLUMN     "balanceImporteeLe" TIMESTAMP(3),
ADD COLUMN     "fichierBalance" TEXT;

-- AlterTable
ALTER TABLE "liens_participation_consolidation" ADD COLUMN     "capitauxPropresEntree" DECIMAL(18,2),
ADD COLUMN     "compteDividendes" TEXT,
ADD COLUMN     "compteTitres" TEXT,
ADD COLUMN     "coutAcquisition" DECIMAL(18,2),
ADD COLUMN     "dateEntree" TIMESTAMP(3),
ADD COLUMN     "depreciationEcartCloture" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "depreciationEcartOuverture" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "dividendesExercice" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "dureeEcartAnnees" INTEGER,
ADD COLUMN     "modeDureeEcart" "ModeDureeEcartAcquisition",
ADD COLUMN     "obligationNonDesengagement" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "lignes_balance_consolidation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "entiteId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "solde" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "lignes_balance_consolidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operations_reciproques_consolidation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "entiteAId" TEXT,
    "compteA" TEXT NOT NULL,
    "entiteBId" TEXT,
    "compteB" TEXT NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "libelle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "operations_reciproques_consolidation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lignes_balance_consolidation_tenantId_idx" ON "lignes_balance_consolidation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "lignes_balance_consolidation_entiteId_numero_key" ON "lignes_balance_consolidation"("entiteId", "numero");

-- CreateIndex
CREATE INDEX "operations_reciproques_consolidation_tenantId_exerciceId_idx" ON "operations_reciproques_consolidation"("tenantId", "exerciceId");

-- AddForeignKey
ALTER TABLE "lignes_balance_consolidation" ADD CONSTRAINT "lignes_balance_consolidation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_balance_consolidation" ADD CONSTRAINT "lignes_balance_consolidation_entiteId_fkey" FOREIGN KEY ("entiteId") REFERENCES "entites_perimetre_consolidation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations_reciproques_consolidation" ADD CONSTRAINT "operations_reciproques_consolidation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations_reciproques_consolidation" ADD CONSTRAINT "operations_reciproques_consolidation_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations_reciproques_consolidation" ADD CONSTRAINT "operations_reciproques_consolidation_entiteAId_fkey" FOREIGN KEY ("entiteAId") REFERENCES "entites_perimetre_consolidation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operations_reciproques_consolidation" ADD CONSTRAINT "operations_reciproques_consolidation_entiteBId_fkey" FOREIGN KEY ("entiteBId") REFERENCES "entites_perimetre_consolidation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

