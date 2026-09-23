-- P8 · Le bulletin de paie émis (Code du travail art. 103 et 214 ; arrêté
-- n° 12/CAB.MIN/ETPS/042 du 8 août 2008, art. 2 et 4). Purement additive :
-- une table neuve, aucune donnée existante touchée.
--
-- RESTRICT sur le salarié et le contrat : un bulletin remis au travailleur se
-- conserve, et supprimer la fiche ne doit ni l'emporter ni le dénouer.

-- CreateEnum
CREATE TYPE "StatutBulletinPaie" AS ENUM ('EMIS', 'ANNULE');

-- CreateTable
CREATE TABLE "bulletins_paie" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "salarieId" TEXT NOT NULL,
    "contratId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "moisDePaie" TEXT NOT NULL,
    "statut" "StatutBulletinPaie" NOT NULL DEFAULT 'EMIS',
    "nomComplet" TEXT NOT NULL,
    "matricule" TEXT,
    "emploi" TEXT,
    "categorieProfessionnelle" TEXT,
    "numeroAffiliationCnss" TEXT,
    "totalVerseFc" DECIMAL(18,2) NOT NULL,
    "assietteSocialeFc" DECIMAL(18,2) NOT NULL,
    "cotisationsTravailleurFc" DECIMAL(18,2) NOT NULL,
    "cotisationsEmployeurFc" DECIMAL(18,2) NOT NULL,
    "irppFc" DECIMAL(18,2) NOT NULL,
    "netAPayerFc" DECIMAL(18,2) NOT NULL,
    "entree" JSONB NOT NULL,
    "calcul" JSONB NOT NULL,
    "emisLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "emisPar" TEXT NOT NULL,
    "remisLe" TIMESTAMP(3),
    "annuleLe" TIMESTAMP(3),
    "annulePar" TEXT,
    "motifAnnulation" TEXT,

    CONSTRAINT "bulletins_paie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bulletins_paie_tenantId_moisDePaie_idx" ON "bulletins_paie"("tenantId", "moisDePaie");

-- CreateIndex
CREATE INDEX "bulletins_paie_tenantId_salarieId_idx" ON "bulletins_paie"("tenantId", "salarieId");

-- CreateIndex
CREATE UNIQUE INDEX "bulletins_paie_tenantId_numero_key" ON "bulletins_paie"("tenantId", "numero");

-- AddForeignKey
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_salarieId_fkey" FOREIGN KEY ("salarieId") REFERENCES "salaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_contratId_fkey" FOREIGN KEY ("contratId") REFERENCES "contrats_travail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

