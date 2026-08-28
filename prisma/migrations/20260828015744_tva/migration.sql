-- CreateTable
CREATE TABLE "taux_tva" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "taux" DECIMAL(5,2) NOT NULL,
    "compteCollecteId" TEXT,
    "compteDeductibleId" TEXT,
    "estActif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "taux_tva_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "taux_tva_tenantId_code_key" ON "taux_tva"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "taux_tva" ADD CONSTRAINT "taux_tva_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taux_tva" ADD CONSTRAINT "taux_tva_compteCollecteId_fkey" FOREIGN KEY ("compteCollecteId") REFERENCES "comptes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "taux_tva" ADD CONSTRAINT "taux_tva_compteDeductibleId_fkey" FOREIGN KEY ("compteDeductibleId") REFERENCES "comptes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
