-- AlterTable
ALTER TABLE "immobilisations" ADD COLUMN     "lieuId" TEXT;

-- CreateTable
CREATE TABLE "lieux_biens" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lieux_biens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lieux_biens_tenantId_code_key" ON "lieux_biens"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_lieuId_fkey" FOREIGN KEY ("lieuId") REFERENCES "lieux_biens"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lieux_biens" ADD CONSTRAINT "lieux_biens_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

