-- AlterTable
ALTER TABLE "entites_perimetre_consolidation" ADD COLUMN     "ecartConversionActifN1" DECIMAL(18,2),
ADD COLUMN     "ecartConversionPassifN1" DECIMAL(18,2);

-- AlterTable
ALTER TABLE "faits_consolidation_exercice" ADD COLUMN     "ecartConversionActifN1" DECIMAL(18,2),
ADD COLUMN     "ecartConversionPassifN1" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "provisions_change_consolidation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "entiteId" TEXT,
    "compteProvision" TEXT NOT NULL,
    "cloture" DECIMAL(18,2) NOT NULL,
    "dotation" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reprise" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provisions_change_consolidation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provisions_change_consolidation_tenantId_exerciceId_idx" ON "provisions_change_consolidation"("tenantId", "exerciceId");

-- AddForeignKey
ALTER TABLE "provisions_change_consolidation" ADD CONSTRAINT "provisions_change_consolidation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisions_change_consolidation" ADD CONSTRAINT "provisions_change_consolidation_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provisions_change_consolidation" ADD CONSTRAINT "provisions_change_consolidation_entiteId_fkey" FOREIGN KEY ("entiteId") REFERENCES "entites_perimetre_consolidation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

