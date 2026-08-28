-- CreateEnum
CREATE TYPE "TypeTiers" AS ENUM ('CLIENT', 'FOURNISSEUR', 'SALARIE', 'AUTRE');

-- CreateEnum
CREATE TYPE "ConditionEcheance" AS ENUM ('NET', 'FIN_DE_MOIS');

-- CreateTable
CREATE TABLE "modeles_reglement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "delaiJours" INTEGER NOT NULL,
    "echeance" "ConditionEcheance" NOT NULL DEFAULT 'NET',
    "estActif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modeles_reglement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "TypeTiers" NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "estActif" BOOLEAN NOT NULL DEFAULT true,
    "modeleReglementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tiers_comptes" (
    "id" TEXT NOT NULL,
    "tiersId" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "estPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tiers_comptes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "modeles_reglement_tenantId_intitule_key" ON "modeles_reglement"("tenantId", "intitule");

-- CreateIndex
CREATE UNIQUE INDEX "tiers_tenantId_code_key" ON "tiers"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "tiers_comptes_compteId_key" ON "tiers_comptes"("compteId");

-- AddForeignKey
ALTER TABLE "modeles_reglement" ADD CONSTRAINT "modeles_reglement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiers" ADD CONSTRAINT "tiers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiers" ADD CONSTRAINT "tiers_modeleReglementId_fkey" FOREIGN KEY ("modeleReglementId") REFERENCES "modeles_reglement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiers_comptes" ADD CONSTRAINT "tiers_comptes_tiersId_fkey" FOREIGN KEY ("tiersId") REFERENCES "tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tiers_comptes" ADD CONSTRAINT "tiers_comptes_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
