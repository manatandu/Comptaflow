-- Abonnements des cabinets clients et leurs factures · registre de l'éditeur,
-- hors de tout dossier. Les factures elles-mêmes vivent dans le dossier de VMG.

-- CreateEnum
CREATE TYPE "TypeFormuleAbonnement" AS ENUM ('FORMULE', 'OPTION');

-- CreateEnum
CREATE TYPE "PeriodiciteFacturationEditeur" AS ENUM ('MENSUELLE', 'ANNUELLE');

-- CreateTable
CREATE TABLE "formules_abonnement" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "type" "TypeFormuleAbonnement" NOT NULL,
    "contenu" TEXT,
    "prixMensuelUsd" DECIMAL(12,2),
    "prixAnnuelUsd" DECIMAL(12,2),
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "formules_abonnement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "abonnements_cabinets" (
    "id" TEXT NOT NULL,
    "cabinetId" TEXT NOT NULL,
    "formuleId" TEXT NOT NULL,
    "dossiersSupplementaires" INTEGER NOT NULL DEFAULT 0,
    "periodicite" "PeriodiciteFacturationEditeur" NOT NULL,
    "debut" DATE NOT NULL,
    "finEssai" DATE,
    "tiersId" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "abonnements_cabinets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "options_abonnement" (
    "abonnementId" TEXT NOT NULL,
    "formuleId" TEXT NOT NULL,

    CONSTRAINT "options_abonnement_pkey" PRIMARY KEY ("abonnementId","formuleId")
);

-- CreateTable
CREATE TABLE "factures_abonnement" (
    "id" TEXT NOT NULL,
    "abonnementId" TEXT NOT NULL,
    "periode" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "montantUsd" DECIMAL(12,2) NOT NULL,
    "cours" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "factures_abonnement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "formules_abonnement_code_key" ON "formules_abonnement"("code");

-- CreateIndex
CREATE UNIQUE INDEX "abonnements_cabinets_cabinetId_key" ON "abonnements_cabinets"("cabinetId");

-- CreateIndex
CREATE UNIQUE INDEX "factures_abonnement_factureId_key" ON "factures_abonnement"("factureId");

-- CreateIndex
CREATE UNIQUE INDEX "factures_abonnement_abonnementId_periode_key" ON "factures_abonnement"("abonnementId", "periode");

-- AddForeignKey
ALTER TABLE "abonnements_cabinets" ADD CONSTRAINT "abonnements_cabinets_cabinetId_fkey" FOREIGN KEY ("cabinetId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonnements_cabinets" ADD CONSTRAINT "abonnements_cabinets_formuleId_fkey" FOREIGN KEY ("formuleId") REFERENCES "formules_abonnement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "abonnements_cabinets" ADD CONSTRAINT "abonnements_cabinets_tiersId_fkey" FOREIGN KEY ("tiersId") REFERENCES "tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "options_abonnement" ADD CONSTRAINT "options_abonnement_abonnementId_fkey" FOREIGN KEY ("abonnementId") REFERENCES "abonnements_cabinets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "options_abonnement" ADD CONSTRAINT "options_abonnement_formuleId_fkey" FOREIGN KEY ("formuleId") REFERENCES "formules_abonnement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_abonnement" ADD CONSTRAINT "factures_abonnement_abonnementId_fkey" FOREIGN KEY ("abonnementId") REFERENCES "abonnements_cabinets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures_abonnement" ADD CONSTRAINT "factures_abonnement_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

