-- Natures de compte (point 14 de la comparaison Sage i7). Voir NatureCompte dans le schéma.

-- CreateEnum
CREATE TYPE "NatureCompteType" AS ENUM ('STOCK', 'CLIENT', 'FOURNISSEUR', 'BANQUE', 'CAISSE', 'CHARGE', 'PRODUIT');

-- CreateTable
CREATE TABLE "natures_compte" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nature" "NatureCompteType" NOT NULL,
    "fourchettes" JSONB NOT NULL,
    "modeReportANouveau" "ModeReportANouveau" NOT NULL,
    "lettrable" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "natures_compte_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "natures_compte_tenantId_nature_key" ON "natures_compte"("tenantId", "nature");

-- AddForeignKey
ALTER TABLE "natures_compte" ADD CONSTRAINT "natures_compte_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

