-- AlterTable
ALTER TABLE "lignes_ecriture" ADD COLUMN     "ligneReleveId" TEXT;

-- CreateTable
CREATE TABLE "lignes_releve_bancaire" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "rapprochementId" TEXT NOT NULL,
    "rang" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "libelle" TEXT NOT NULL,
    "reference" TEXT,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lignes_releve_bancaire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lignes_releve_bancaire_rapprochementId_idx" ON "lignes_releve_bancaire"("rapprochementId");

-- CreateIndex
CREATE INDEX "lignes_releve_bancaire_tenantId_idx" ON "lignes_releve_bancaire"("tenantId");

-- AddForeignKey
ALTER TABLE "lignes_ecriture" ADD CONSTRAINT "lignes_ecriture_ligneReleveId_fkey" FOREIGN KEY ("ligneReleveId") REFERENCES "lignes_releve_bancaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_releve_bancaire" ADD CONSTRAINT "lignes_releve_bancaire_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_releve_bancaire" ADD CONSTRAINT "lignes_releve_bancaire_rapprochementId_fkey" FOREIGN KEY ("rapprochementId") REFERENCES "rapprochements_bancaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

