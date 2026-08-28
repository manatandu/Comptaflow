-- CreateEnum
CREATE TYPE "ModeAmortissement" AS ENUM ('LINEAIRE');

-- CreateEnum
CREATE TYPE "StatutImmobilisation" AS ENUM ('EN_SERVICE', 'CEDEE', 'MISE_HORS_SERVICE');

-- CreateTable
CREATE TABLE "familles_immobilisation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "compteImmobilisationId" TEXT NOT NULL,
    "compteAmortissementId" TEXT NOT NULL,
    "compteDotationId" TEXT NOT NULL,
    "dureeAmortissementAns" INTEGER NOT NULL,
    "modeAmortissement" "ModeAmortissement" NOT NULL DEFAULT 'LINEAIRE',
    "estActif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "familles_immobilisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "immobilisations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "familleId" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "numeroInventaire" TEXT,
    "compteImmobilisationId" TEXT NOT NULL,
    "compteAmortissementId" TEXT NOT NULL,
    "compteDotationId" TEXT NOT NULL,
    "dateAcquisition" TIMESTAMP(3) NOT NULL,
    "dateMiseEnService" TIMESTAMP(3) NOT NULL,
    "valeurOrigine" DECIMAL(18,2) NOT NULL,
    "valeurResiduelle" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dureeAmortissementAns" INTEGER NOT NULL,
    "modeAmortissement" "ModeAmortissement" NOT NULL DEFAULT 'LINEAIRE',
    "statut" "StatutImmobilisation" NOT NULL DEFAULT 'EN_SERVICE',
    "dateSortie" TIMESTAMP(3),
    "prixCession" DECIMAL(18,2),
    "ecritureAcquisitionId" TEXT NOT NULL,
    "ecritureSortieId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "immobilisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dotations_amortissement" (
    "id" TEXT NOT NULL,
    "immobilisationId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "ecritureId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dotations_amortissement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "familles_immobilisation_tenantId_code_key" ON "familles_immobilisation"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "immobilisations_ecritureAcquisitionId_key" ON "immobilisations"("ecritureAcquisitionId");

-- CreateIndex
CREATE UNIQUE INDEX "immobilisations_ecritureSortieId_key" ON "immobilisations"("ecritureSortieId");

-- CreateIndex
CREATE UNIQUE INDEX "dotations_amortissement_ecritureId_key" ON "dotations_amortissement"("ecritureId");

-- CreateIndex
CREATE UNIQUE INDEX "dotations_amortissement_immobilisationId_exerciceId_key" ON "dotations_amortissement"("immobilisationId", "exerciceId");

-- AddForeignKey
ALTER TABLE "familles_immobilisation" ADD CONSTRAINT "familles_immobilisation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "familles_immobilisation" ADD CONSTRAINT "familles_immobilisation_compteImmobilisationId_fkey" FOREIGN KEY ("compteImmobilisationId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "familles_immobilisation" ADD CONSTRAINT "familles_immobilisation_compteAmortissementId_fkey" FOREIGN KEY ("compteAmortissementId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "familles_immobilisation" ADD CONSTRAINT "familles_immobilisation_compteDotationId_fkey" FOREIGN KEY ("compteDotationId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_familleId_fkey" FOREIGN KEY ("familleId") REFERENCES "familles_immobilisation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_compteImmobilisationId_fkey" FOREIGN KEY ("compteImmobilisationId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_compteAmortissementId_fkey" FOREIGN KEY ("compteAmortissementId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_compteDotationId_fkey" FOREIGN KEY ("compteDotationId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_ecritureAcquisitionId_fkey" FOREIGN KEY ("ecritureAcquisitionId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_ecritureSortieId_fkey" FOREIGN KEY ("ecritureSortieId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dotations_amortissement" ADD CONSTRAINT "dotations_amortissement_immobilisationId_fkey" FOREIGN KEY ("immobilisationId") REFERENCES "immobilisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dotations_amortissement" ADD CONSTRAINT "dotations_amortissement_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dotations_amortissement" ADD CONSTRAINT "dotations_amortissement_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
