-- AlterTable
ALTER TABLE "comptes" ADD COLUMN     "bailleurId" TEXT;

-- CreateTable
CREATE TABLE "bailleurs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "estActif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bailleurs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "bailleurs_tenantId_code_key" ON "bailleurs"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_bailleurId_fkey" FOREIGN KEY ("bailleurId") REFERENCES "bailleurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bailleurs" ADD CONSTRAINT "bailleurs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
