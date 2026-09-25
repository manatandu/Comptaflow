-- CreateTable
CREATE TABLE "od_analytiques" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "libelle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "od_analytiques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_od_analytique" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "odId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "lignes_od_analytique_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "od_analytiques_tenantId_exerciceId_idx" ON "od_analytiques"("tenantId", "exerciceId");

-- CreateIndex
CREATE INDEX "lignes_od_analytique_odId_idx" ON "lignes_od_analytique"("odId");

-- CreateIndex
CREATE INDEX "lignes_od_analytique_sectionId_idx" ON "lignes_od_analytique"("sectionId");

-- AddForeignKey
ALTER TABLE "od_analytiques" ADD CONSTRAINT "od_analytiques_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "od_analytiques" ADD CONSTRAINT "od_analytiques_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "od_analytiques" ADD CONSTRAINT "od_analytiques_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans_analytiques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "od_analytiques" ADD CONSTRAINT "od_analytiques_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_od_analytique" ADD CONSTRAINT "lignes_od_analytique_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_od_analytique" ADD CONSTRAINT "lignes_od_analytique_odId_fkey" FOREIGN KEY ("odId") REFERENCES "od_analytiques"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_od_analytique" ADD CONSTRAINT "lignes_od_analytique_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections_analytiques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

