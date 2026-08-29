-- CreateEnum
CREATE TYPE "TypeRelance" AS ENUM ('PREVENTIVE', 'RAPPEL', 'RELEVE');

-- CreateTable
CREATE TABLE "niveaux_relance" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "niveau" INTEGER NOT NULL,
    "libelle" TEXT NOT NULL,
    "type" "TypeRelance" NOT NULL DEFAULT 'RAPPEL',
    "joursApresEcheance" INTEGER NOT NULL,
    "modeleTexte" TEXT NOT NULL,
    "estActif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "niveaux_relance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "relances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "tiersId" TEXT,
    "niveauId" TEXT NOT NULL,
    "dateRelance" TIMESTAMP(3) NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "texte" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "relances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "niveaux_relance_tenantId_niveau_key" ON "niveaux_relance"("tenantId", "niveau");

-- CreateIndex
CREATE INDEX "relances_tenantId_compteId_idx" ON "relances"("tenantId", "compteId");

-- AddForeignKey
ALTER TABLE "niveaux_relance" ADD CONSTRAINT "niveaux_relance_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relances" ADD CONSTRAINT "relances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relances" ADD CONSTRAINT "relances_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relances" ADD CONSTRAINT "relances_tiersId_fkey" FOREIGN KEY ("tiersId") REFERENCES "tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "relances" ADD CONSTRAINT "relances_niveauId_fkey" FOREIGN KEY ("niveauId") REFERENCES "niveaux_relance"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
