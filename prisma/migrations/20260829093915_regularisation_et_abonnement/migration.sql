-- CreateEnum
CREATE TYPE "TypeRegularisation" AS ENUM ('CHARGE_CONSTATEE_AVANCE', 'PRODUIT_CONSTATE_AVANCE', 'SUBVENTION_PLURIANNUELLE');

-- CreateEnum
CREATE TYPE "PeriodiciteAbonnement" AS ENUM ('MENSUELLE', 'TRIMESTRIELLE', 'SEMESTRIELLE', 'ANNUELLE');

-- CreateTable
CREATE TABLE "regularisations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "type" "TypeRegularisation" NOT NULL,
    "libelle" TEXT NOT NULL,
    "compteChargeProduitId" TEXT NOT NULL,
    "compteDifferId" TEXT NOT NULL,
    "montantTotal" DECIMAL(18,2) NOT NULL,
    "periodeDebut" TIMESTAMP(3) NOT NULL,
    "periodeFin" TIMESTAMP(3) NOT NULL,
    "montantDiffere" DECIMAL(18,2) NOT NULL,
    "ecritureConstatationId" TEXT,
    "ecritureRepriseId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "regularisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "modeles_abonnement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "compteDebitId" TEXT NOT NULL,
    "compteCreditId" TEXT NOT NULL,
    "periodicite" "PeriodiciteAbonnement" NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "estActif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "modeles_abonnement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "echeances_abonnement" (
    "id" TEXT NOT NULL,
    "abonnementId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "ecritureId" TEXT,

    CONSTRAINT "echeances_abonnement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regularisations_ecritureConstatationId_key" ON "regularisations"("ecritureConstatationId");

-- CreateIndex
CREATE UNIQUE INDEX "regularisations_ecritureRepriseId_key" ON "regularisations"("ecritureRepriseId");

-- CreateIndex
CREATE INDEX "regularisations_tenantId_exerciceId_idx" ON "regularisations"("tenantId", "exerciceId");

-- CreateIndex
CREATE UNIQUE INDEX "modeles_abonnement_tenantId_code_key" ON "modeles_abonnement"("tenantId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "echeances_abonnement_ecritureId_key" ON "echeances_abonnement"("ecritureId");

-- CreateIndex
CREATE INDEX "echeances_abonnement_abonnementId_idx" ON "echeances_abonnement"("abonnementId");

-- CreateIndex
CREATE UNIQUE INDEX "echeances_abonnement_abonnementId_date_key" ON "echeances_abonnement"("abonnementId", "date");

-- AddForeignKey
ALTER TABLE "regularisations" ADD CONSTRAINT "regularisations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisations" ADD CONSTRAINT "regularisations_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisations" ADD CONSTRAINT "regularisations_compteChargeProduitId_fkey" FOREIGN KEY ("compteChargeProduitId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisations" ADD CONSTRAINT "regularisations_compteDifferId_fkey" FOREIGN KEY ("compteDifferId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisations" ADD CONSTRAINT "regularisations_ecritureConstatationId_fkey" FOREIGN KEY ("ecritureConstatationId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisations" ADD CONSTRAINT "regularisations_ecritureRepriseId_fkey" FOREIGN KEY ("ecritureRepriseId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modeles_abonnement" ADD CONSTRAINT "modeles_abonnement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modeles_abonnement" ADD CONSTRAINT "modeles_abonnement_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journaux"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modeles_abonnement" ADD CONSTRAINT "modeles_abonnement_compteDebitId_fkey" FOREIGN KEY ("compteDebitId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "modeles_abonnement" ADD CONSTRAINT "modeles_abonnement_compteCreditId_fkey" FOREIGN KEY ("compteCreditId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeances_abonnement" ADD CONSTRAINT "echeances_abonnement_abonnementId_fkey" FOREIGN KEY ("abonnementId") REFERENCES "modeles_abonnement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "echeances_abonnement" ADD CONSTRAINT "echeances_abonnement_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
