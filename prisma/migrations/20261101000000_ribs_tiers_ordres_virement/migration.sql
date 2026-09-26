-- CreateEnum
CREATE TYPE "StatutOrdreVirement" AS ENUM ('A_IMPRIMER', 'IMPRIME', 'ANNULE');

-- CreateTable
CREATE TABLE "ribs_tiers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tiersId" TEXT NOT NULL,
    "banque" TEXT NOT NULL,
    "titulaire" TEXT,
    "codeBanque" TEXT,
    "codeGuichet" TEXT,
    "numeroCompte" TEXT,
    "cle" TEXT,
    "iban" TEXT,
    "codeBic" TEXT,
    "devise" TEXT,
    "estPrincipal" BOOLEAN NOT NULL DEFAULT false,
    "commentaire" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ribs_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordres_virement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "date" DATE NOT NULL,
    "journalId" TEXT NOT NULL,
    "donneurBanque" TEXT NOT NULL,
    "donneurCoordonnees" TEXT NOT NULL,
    "donneurBic" TEXT,
    "total" DECIMAL(18,2) NOT NULL,
    "statut" "StatutOrdreVirement" NOT NULL DEFAULT 'A_IMPRIMER',
    "premiereImpressionLe" TIMESTAMP(3),
    "premiereImpressionPar" TEXT,
    "nombreImpressions" INTEGER NOT NULL DEFAULT 0,
    "annuleLe" TIMESTAMP(3),
    "annulePar" TEXT,
    "motifAnnulation" TEXT,
    "creePar" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ordres_virement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_ordre_virement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "ordreId" TEXT NOT NULL,
    "tiersId" TEXT NOT NULL,
    "beneficiaire" TEXT NOT NULL,
    "banque" TEXT NOT NULL,
    "coordonnees" TEXT NOT NULL,
    "codeBic" TEXT,
    "montant" DECIMAL(18,2) NOT NULL,
    "reference" TEXT,
    "pieceReglement" TEXT NOT NULL,
    "ecritureId" TEXT,

    CONSTRAINT "lignes_ordre_virement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ribs_tiers_tenantId_tiersId_idx" ON "ribs_tiers"("tenantId", "tiersId");

-- CreateIndex
CREATE UNIQUE INDEX "ordres_virement_tenantId_numero_key" ON "ordres_virement"("tenantId", "numero");

-- CreateIndex
CREATE INDEX "lignes_ordre_virement_ordreId_idx" ON "lignes_ordre_virement"("ordreId");

-- CreateIndex
CREATE INDEX "lignes_ordre_virement_tenantId_ecritureId_idx" ON "lignes_ordre_virement"("tenantId", "ecritureId");

-- AddForeignKey
ALTER TABLE "ribs_tiers" ADD CONSTRAINT "ribs_tiers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ribs_tiers" ADD CONSTRAINT "ribs_tiers_tiersId_fkey" FOREIGN KEY ("tiersId") REFERENCES "tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordres_virement" ADD CONSTRAINT "ordres_virement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordres_virement" ADD CONSTRAINT "ordres_virement_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journaux"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_ordre_virement" ADD CONSTRAINT "lignes_ordre_virement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_ordre_virement" ADD CONSTRAINT "lignes_ordre_virement_ordreId_fkey" FOREIGN KEY ("ordreId") REFERENCES "ordres_virement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_ordre_virement" ADD CONSTRAINT "lignes_ordre_virement_tiersId_fkey" FOREIGN KEY ("tiersId") REFERENCES "tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_ordre_virement" ADD CONSTRAINT "lignes_ordre_virement_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

