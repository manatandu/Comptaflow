-- Lots de virements récurrents · définition d'OmegaX (Moyens de Paiement de Sage les nomme).
-- CreateTable
CREATE TABLE "lots_virement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "journalId" TEXT,
    "creePar" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lots_virement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_lot_virement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "lotId" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "lignes_lot_virement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lots_virement_tenantId_nom_key" ON "lots_virement"("tenantId", "nom");

-- CreateIndex
CREATE INDEX "lignes_lot_virement_tenantId_idx" ON "lignes_lot_virement"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "lignes_lot_virement_lotId_compteId_key" ON "lignes_lot_virement"("lotId", "compteId");

-- AddForeignKey
ALTER TABLE "lots_virement" ADD CONSTRAINT "lots_virement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lots_virement" ADD CONSTRAINT "lots_virement_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journaux"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_lot_virement" ADD CONSTRAINT "lignes_lot_virement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_lot_virement" ADD CONSTRAINT "lignes_lot_virement_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lots_virement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_lot_virement" ADD CONSTRAINT "lignes_lot_virement_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

