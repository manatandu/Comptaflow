-- Consolidation SYSCOHADA, tranche 1 · le périmètre (AUDCIF art. 74 à 98, D4C ch. XII).
-- Trois tables par exercice · les entités, leurs participations (droits de vote ET capital),
-- et les faits que l'obligation et ses dispenses demandent et qu'aucun livre ne porte.

-- CreateEnum
CREATE TYPE "MotifExclusionConsolidation" AS ENUM ('PERTE_CONTROLE_DEMONTREE', 'RESTRICTIONS_SEVERES_DURABLES', 'DETENUE_EN_VUE_DE_CESSION', 'INFORMATION_FRAIS_EXCESSIFS', 'IMPORTANCE_NEGLIGEABLE');

-- CreateTable
CREATE TABLE "entites_perimetre_consolidation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "designationMajoriteDeuxExercices" BOOLEAN NOT NULL DEFAULT false,
    "aucunAutreAssocieSuperieur" BOOLEAN NOT NULL DEFAULT false,
    "controleContractuel" BOOLEAN NOT NULL DEFAULT false,
    "accordControleConjoint" BOOLEAN NOT NULL DEFAULT false,
    "influenceNotableDeclaree" BOOLEAN NOT NULL DEFAULT false,
    "motifExclusion" "MotifExclusionConsolidation",
    "justificationExclusion" TEXT,
    "dateCloture" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entites_perimetre_consolidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liens_participation_consolidation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "detentriceId" TEXT,
    "detenueId" TEXT NOT NULL,
    "pctDroitsVote" DECIMAL(7,4) NOT NULL,
    "pctCapital" DECIMAL(7,4) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liens_participation_consolidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faits_consolidation_exercice" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "sousControleEntiteOhadaConsolidante" BOOLEAN NOT NULL DEFAULT false,
    "siegesDansDeuxRegions" BOOLEAN NOT NULL DEFAULT false,
    "appelPublicEpargne" BOOLEAN NOT NULL DEFAULT false,
    "demandeAssociesDixieme" BOOLEAN NOT NULL DEFAULT false,
    "chiffreAffairesN" DECIMAL(18,2),
    "chiffreAffairesN1" DECIMAL(18,2),
    "seuilEquivalentFc" DECIMAL(18,2),
    "sourceSeuil" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faits_consolidation_exercice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "entites_perimetre_consolidation_tenantId_exerciceId_idx" ON "entites_perimetre_consolidation"("tenantId", "exerciceId");

-- CreateIndex
CREATE UNIQUE INDEX "entites_perimetre_consolidation_exerciceId_nom_key" ON "entites_perimetre_consolidation"("exerciceId", "nom");

-- CreateIndex
CREATE INDEX "liens_participation_consolidation_tenantId_exerciceId_idx" ON "liens_participation_consolidation"("tenantId", "exerciceId");

-- CreateIndex
CREATE UNIQUE INDEX "faits_consolidation_exercice_exerciceId_key" ON "faits_consolidation_exercice"("exerciceId");

-- CreateIndex
CREATE INDEX "faits_consolidation_exercice_tenantId_idx" ON "faits_consolidation_exercice"("tenantId");

-- AddForeignKey
ALTER TABLE "entites_perimetre_consolidation" ADD CONSTRAINT "entites_perimetre_consolidation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entites_perimetre_consolidation" ADD CONSTRAINT "entites_perimetre_consolidation_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liens_participation_consolidation" ADD CONSTRAINT "liens_participation_consolidation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liens_participation_consolidation" ADD CONSTRAINT "liens_participation_consolidation_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liens_participation_consolidation" ADD CONSTRAINT "liens_participation_consolidation_detentriceId_fkey" FOREIGN KEY ("detentriceId") REFERENCES "entites_perimetre_consolidation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liens_participation_consolidation" ADD CONSTRAINT "liens_participation_consolidation_detenueId_fkey" FOREIGN KEY ("detenueId") REFERENCES "entites_perimetre_consolidation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faits_consolidation_exercice" ADD CONSTRAINT "faits_consolidation_exercice_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faits_consolidation_exercice" ADD CONSTRAINT "faits_consolidation_exercice_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

