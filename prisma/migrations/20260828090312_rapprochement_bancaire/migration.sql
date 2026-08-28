-- CreateEnum
CREATE TYPE "StatutRapprochement" AS ENUM ('EN_COURS', 'CLOTURE');

-- AlterTable
ALTER TABLE "lignes_ecriture" ADD COLUMN     "rapprochementId" TEXT;

-- CreateTable
CREATE TABLE "rapprochements_bancaires" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "dateReleve" TIMESTAMP(3) NOT NULL,
    "soldeReleve" DECIMAL(18,2) NOT NULL,
    "statut" "StatutRapprochement" NOT NULL DEFAULT 'EN_COURS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "clotureAt" TIMESTAMP(3),

    CONSTRAINT "rapprochements_bancaires_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lignes_ecriture_compteId_rapprochementId_idx" ON "lignes_ecriture"("compteId", "rapprochementId");

-- AddForeignKey
ALTER TABLE "lignes_ecriture" ADD CONSTRAINT "lignes_ecriture_rapprochementId_fkey" FOREIGN KEY ("rapprochementId") REFERENCES "rapprochements_bancaires"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rapprochements_bancaires" ADD CONSTRAINT "rapprochements_bancaires_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rapprochements_bancaires" ADD CONSTRAINT "rapprochements_bancaires_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
