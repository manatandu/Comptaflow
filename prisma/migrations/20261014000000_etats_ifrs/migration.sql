-- CreateEnum
CREATE TYPE "ActivitePrincipaleIfrs" AS ENUM ('AUCUNE', 'INVESTIR_ACTIFS', 'FINANCER_CLIENTS');

-- CreateTable
CREATE TABLE "parametres_ifrs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "activitePrincipale" "ActivitePrincipaleIfrs",
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parametres_ifrs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regles_correspondance_ifrs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "prefixe" VARCHAR(13) NOT NULL,
    "rubrique" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regles_correspondance_ifrs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retraitements_ifrs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "fondement" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "retraitements_ifrs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_retraitement_ifrs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "retraitementId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "rubrique" TEXT NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "lignes_retraitement_ifrs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "parametres_ifrs_tenantId_key" ON "parametres_ifrs"("tenantId");

-- CreateIndex
CREATE INDEX "regles_correspondance_ifrs_tenantId_idx" ON "regles_correspondance_ifrs"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "regles_correspondance_ifrs_tenantId_prefixe_key" ON "regles_correspondance_ifrs"("tenantId", "prefixe");

-- CreateIndex
CREATE INDEX "retraitements_ifrs_tenantId_exerciceId_idx" ON "retraitements_ifrs"("tenantId", "exerciceId");

-- CreateIndex
CREATE INDEX "lignes_retraitement_ifrs_retraitementId_idx" ON "lignes_retraitement_ifrs"("retraitementId");

-- AddForeignKey
ALTER TABLE "parametres_ifrs" ADD CONSTRAINT "parametres_ifrs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regles_correspondance_ifrs" ADD CONSTRAINT "regles_correspondance_ifrs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retraitements_ifrs" ADD CONSTRAINT "retraitements_ifrs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retraitements_ifrs" ADD CONSTRAINT "retraitements_ifrs_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_retraitement_ifrs" ADD CONSTRAINT "lignes_retraitement_ifrs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_retraitement_ifrs" ADD CONSTRAINT "lignes_retraitement_ifrs_retraitementId_fkey" FOREIGN KEY ("retraitementId") REFERENCES "retraitements_ifrs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

