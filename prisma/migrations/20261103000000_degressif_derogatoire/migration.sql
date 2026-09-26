-- CreateEnum
CREATE TYPE "NatureDerogatoire" AS ENUM ('EXERCICE', 'SOLDE_SORTIE');

-- AlterTable
ALTER TABLE "immobilisations" ADD COLUMN     "categorieDegressif" TEXT,
ADD COLUMN     "degressifFiscal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "dureeFiscaleAns" INTEGER,
ADD COLUMN     "optionDegressifLe" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "amortissements_derogatoires" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "immobilisationId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "nature" "NatureDerogatoire" NOT NULL DEFAULT 'EXERCICE',
    "annuiteFiscale" DECIMAL(18,2) NOT NULL,
    "dotationComptable" DECIMAL(18,2) NOT NULL,
    "dotation" DECIMAL(18,2) NOT NULL,
    "reprise" DECIMAL(18,2) NOT NULL,
    "excedentAReintegrer" DECIMAL(18,2) NOT NULL,
    "ecritureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "amortissements_derogatoires_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "amortissements_derogatoires_ecritureId_key" ON "amortissements_derogatoires"("ecritureId");

-- CreateIndex
CREATE INDEX "amortissements_derogatoires_tenantId_idx" ON "amortissements_derogatoires"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "amortissements_derogatoires_immobilisationId_exerciceId_nat_key" ON "amortissements_derogatoires"("immobilisationId", "exerciceId", "nature");

-- AddForeignKey
ALTER TABLE "amortissements_derogatoires" ADD CONSTRAINT "amortissements_derogatoires_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amortissements_derogatoires" ADD CONSTRAINT "amortissements_derogatoires_immobilisationId_fkey" FOREIGN KEY ("immobilisationId") REFERENCES "immobilisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amortissements_derogatoires" ADD CONSTRAINT "amortissements_derogatoires_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "amortissements_derogatoires" ADD CONSTRAINT "amortissements_derogatoires_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

