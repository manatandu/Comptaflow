-- CreateTable
CREATE TABLE "proces_verbaux_comptage_caisse" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campagneId" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "sousCommissionId" TEXT NOT NULL,
    "dateComptage" TIMESTAMP(3) NOT NULL,
    "heureComptage" TEXT,
    "soldeComptableFige" DECIMAL(18,2) NOT NULL,
    "especesComptees" DECIMAL(18,2) NOT NULL,
    "ecart" DECIMAL(18,2) NOT NULL,
    "attestationEtablieLe" TIMESTAMP(3),
    "attestationPar" TEXT,
    "observations" TEXT,
    "etabliLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "etabliPar" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proces_verbaux_comptage_caisse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupures_comptees" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pvId" TEXT NOT NULL,
    "valeurUnitaire" DECIMAL(18,2) NOT NULL,
    "nombre" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupures_comptees_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proces_verbaux_comptage_caisse_tenantId_campagneId_idx" ON "proces_verbaux_comptage_caisse"("tenantId", "campagneId");

-- CreateIndex
CREATE UNIQUE INDEX "proces_verbaux_comptage_caisse_campagneId_compteId_key" ON "proces_verbaux_comptage_caisse"("campagneId", "compteId");

-- CreateIndex
CREATE INDEX "coupures_comptees_tenantId_pvId_idx" ON "coupures_comptees"("tenantId", "pvId");

-- AddForeignKey
ALTER TABLE "proces_verbaux_comptage_caisse" ADD CONSTRAINT "proces_verbaux_comptage_caisse_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proces_verbaux_comptage_caisse" ADD CONSTRAINT "proces_verbaux_comptage_caisse_campagneId_fkey" FOREIGN KEY ("campagneId") REFERENCES "campagnes_inventaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proces_verbaux_comptage_caisse" ADD CONSTRAINT "proces_verbaux_comptage_caisse_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proces_verbaux_comptage_caisse" ADD CONSTRAINT "proces_verbaux_comptage_caisse_sousCommissionId_fkey" FOREIGN KEY ("sousCommissionId") REFERENCES "sous_commissions_inventaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupures_comptees" ADD CONSTRAINT "coupures_comptees_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupures_comptees" ADD CONSTRAINT "coupures_comptees_pvId_fkey" FOREIGN KEY ("pvId") REFERENCES "proces_verbaux_comptage_caisse"("id") ON DELETE CASCADE ON UPDATE CASCADE;
