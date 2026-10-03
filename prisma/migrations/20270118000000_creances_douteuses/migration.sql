-- LIGNE A7 · créances douteuses ou litigieuses, dépréciation dossier par
-- dossier (relevé CPCC C3, décision de Manasse du 2026-10-02).
--
-- AUDCIF Titre VII et SYCEBNL, fiches des comptes 41 et 49 · reclassement au
-- 416, dépréciation au 491 à la clôture (D 659), reprise au 759, perte au 651
-- au TTC entier. Une ligne par créance, motif et pièces gardés · la fiche du
-- compte 49 exige un élément « individualisé » et des motifs justifiés.
--
-- Réécrite le 2026-10-03 (A7 scindée, décision de Manasse) · jamais appliquée
-- hors bases jetables, elle ne crée plus que ce qui reste à A7. La TVA des
-- créances irrécouvrables (figé des liquidations, régularisations, ventes
-- d'origine) est renvoyée à la ligne A7 bis.

-- CreateEnum
CREATE TYPE "NatureCreanceDouteuse" AS ENUM ('LITIGIEUSE', 'DOUTEUSE');

-- CreateEnum
CREATE TYPE "TypeMouvementCreanceDouteuse" AS ENUM ('PERTE', 'RECOUVREMENT');

-- CreateTable
CREATE TABLE "creances_douteuses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "nature" "NatureCreanceDouteuse" NOT NULL,
    "compteCreanceId" TEXT NOT NULL,
    "compte416Id" TEXT NOT NULL,
    "compte491Id" TEXT NOT NULL,
    "dateReclassement" DATE NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "motif" TEXT NOT NULL,
    "pieces" JSONB NOT NULL,
    "ecritureReclassementId" TEXT,
    "declareeOuverture" BOOLEAN NOT NULL DEFAULT false,
    "sourceDeclaration" TEXT,
    "depreciationOuverture" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "annuleeLe" TIMESTAMP(3),
    "annuleePar" TEXT,
    "motifAnnulation" TEXT,
    "annulation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "creances_douteuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajustements_creances_douteuses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "creanceId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "depreciationNecessaire" DECIMAL(18,2) NOT NULL,
    "depreciationEnPlace" DECIMAL(18,2) NOT NULL,
    "ecart" DECIMAL(18,2) NOT NULL,
    "motif" TEXT NOT NULL,
    "pieces" JSONB NOT NULL,
    "ecritureId" TEXT,
    "annuleeLe" TIMESTAMP(3),
    "annuleePar" TEXT,
    "motifAnnulation" TEXT,
    "annulation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "ajustements_creances_douteuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mouvements_creances_douteuses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "creanceId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "type" "TypeMouvementCreanceDouteuse" NOT NULL,
    "date" DATE NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "motif" TEXT NOT NULL,
    "pieces" JSONB NOT NULL,
    "ecritureId" TEXT,
    "annuleeLe" TIMESTAMP(3),
    "annuleePar" TEXT,
    "motifAnnulation" TEXT,
    "annulation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "mouvements_creances_douteuses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verrous_creances_douteuses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "geste" TEXT NOT NULL,
    "echeance" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verrous_creances_douteuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "creances_douteuses_ecritureReclassementId_key" ON "creances_douteuses"("ecritureReclassementId");

-- CreateIndex
CREATE INDEX "creances_douteuses_tenantId_idx" ON "creances_douteuses"("tenantId");

-- CreateIndex
CREATE INDEX "creances_douteuses_exerciceId_idx" ON "creances_douteuses"("exerciceId");

-- CreateIndex
CREATE UNIQUE INDEX "ajustements_creances_douteuses_ecritureId_key" ON "ajustements_creances_douteuses"("ecritureId");

-- CreateIndex
CREATE INDEX "ajustements_creances_douteuses_tenantId_idx" ON "ajustements_creances_douteuses"("tenantId");

-- CreateIndex
CREATE INDEX "ajustements_creances_douteuses_exerciceId_idx" ON "ajustements_creances_douteuses"("exerciceId");

-- Une seule revue NON ANNULÉE par créance et par exercice · deux NULL tenus
-- pour ÉGAUX, les revues annulées, datées, s'y ajoutent sans le rompre.
CREATE UNIQUE INDEX "ajustements_creances_douteuses_creanceId_exerciceId_annulee_key"
  ON "ajustements_creances_douteuses"("creanceId", "exerciceId", "annuleeLe") NULLS NOT DISTINCT;

-- CreateIndex
CREATE UNIQUE INDEX "mouvements_creances_douteuses_ecritureId_key" ON "mouvements_creances_douteuses"("ecritureId");

-- CreateIndex
CREATE INDEX "mouvements_creances_douteuses_tenantId_idx" ON "mouvements_creances_douteuses"("tenantId");

-- CreateIndex
CREATE INDEX "mouvements_creances_douteuses_creanceId_idx" ON "mouvements_creances_douteuses"("creanceId");

-- CreateIndex
CREATE INDEX "mouvements_creances_douteuses_exerciceId_idx" ON "mouvements_creances_douteuses"("exerciceId");

-- CreateIndex
CREATE UNIQUE INDEX "verrous_creances_douteuses_tenantId_key" ON "verrous_creances_douteuses"("tenantId");

-- AddForeignKey
ALTER TABLE "creances_douteuses" ADD CONSTRAINT "creances_douteuses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creances_douteuses" ADD CONSTRAINT "creances_douteuses_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creances_douteuses" ADD CONSTRAINT "creances_douteuses_compteCreanceId_fkey" FOREIGN KEY ("compteCreanceId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creances_douteuses" ADD CONSTRAINT "creances_douteuses_compte416Id_fkey" FOREIGN KEY ("compte416Id") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creances_douteuses" ADD CONSTRAINT "creances_douteuses_compte491Id_fkey" FOREIGN KEY ("compte491Id") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creances_douteuses" ADD CONSTRAINT "creances_douteuses_ecritureReclassementId_fkey" FOREIGN KEY ("ecritureReclassementId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustements_creances_douteuses" ADD CONSTRAINT "ajustements_creances_douteuses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustements_creances_douteuses" ADD CONSTRAINT "ajustements_creances_douteuses_creanceId_fkey" FOREIGN KEY ("creanceId") REFERENCES "creances_douteuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustements_creances_douteuses" ADD CONSTRAINT "ajustements_creances_douteuses_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ajustements_creances_douteuses" ADD CONSTRAINT "ajustements_creances_douteuses_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_creances_douteuses" ADD CONSTRAINT "mouvements_creances_douteuses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_creances_douteuses" ADD CONSTRAINT "mouvements_creances_douteuses_creanceId_fkey" FOREIGN KEY ("creanceId") REFERENCES "creances_douteuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_creances_douteuses" ADD CONSTRAINT "mouvements_creances_douteuses_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_creances_douteuses" ADD CONSTRAINT "mouvements_creances_douteuses_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verrous_creances_douteuses" ADD CONSTRAINT "verrous_creances_douteuses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

