-- Ligne A20 · comptabilité de gestion (relevé CPCC C17). Définitions
-- d'OmegaX · AUDCIF Titre VI (« COMPTABILITÉ ANALYTIQUE DE GESTION », « ni
-- normalisée, ni obligatoire ») ; imputation rationnelle, Titre VIII ch. 14
-- § 2.3.2. Rien n'entre au grand livre · la répartition passe par des OD
-- analytiques, le coût de production et le seuil se calculent.

-- CreateEnum
CREATE TYPE "ComportementGestion" AS ENUM ('CHARGE_FIXE', 'CHARGE_VARIABLE', 'CHARGE_SEMI_VARIABLE', 'PRODUIT_ACTIVITE', 'HORS_CALCUL');

-- CreateEnum
CREATE TYPE "ModeCleRepartition" AS ENUM ('POURCENTAGE', 'UNITES');

-- AlterTable
ALTER TABLE "comptes" ADD COLUMN     "comportementGestion" "ComportementGestion",
ADD COLUMN     "partVariableGestionPct" DECIMAL(5,2);

-- AlterTable
ALTER TABLE "od_analytiques" ADD COLUMN     "cleRepartitionId" TEXT;

-- CreateTable
CREATE TABLE "cles_repartition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sectionSourceId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "mode" "ModeCleRepartition" NOT NULL,
    "unite" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "cles_repartition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_cle_repartition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cleId" TEXT NOT NULL,
    "sectionCibleId" TEXT NOT NULL,
    "valeur" DECIMAL(18,4) NOT NULL,

    CONSTRAINT "lignes_cle_repartition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "couts_production_declares" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "unite" TEXT NOT NULL,
    "capaciteNormale" DECIMAL(18,4) NOT NULL,
    "activiteReelle" DECIMAL(18,4) NOT NULL,
    "quantiteProduite" DECIMAL(18,4),
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "couts_production_declares_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cles_repartition_tenantId_exerciceId_idx" ON "cles_repartition"("tenantId", "exerciceId");

-- CreateIndex
CREATE UNIQUE INDEX "cles_repartition_exerciceId_sectionSourceId_key" ON "cles_repartition"("exerciceId", "sectionSourceId");

-- CreateIndex
CREATE INDEX "lignes_cle_repartition_tenantId_cleId_idx" ON "lignes_cle_repartition"("tenantId", "cleId");

-- CreateIndex
CREATE UNIQUE INDEX "lignes_cle_repartition_cleId_sectionCibleId_key" ON "lignes_cle_repartition"("cleId", "sectionCibleId");

-- CreateIndex
CREATE INDEX "couts_production_declares_tenantId_exerciceId_idx" ON "couts_production_declares"("tenantId", "exerciceId");

-- CreateIndex
CREATE UNIQUE INDEX "couts_production_declares_exerciceId_sectionId_key" ON "couts_production_declares"("exerciceId", "sectionId");

-- CreateIndex
CREATE INDEX "od_analytiques_cleRepartitionId_idx" ON "od_analytiques"("cleRepartitionId");

-- AddForeignKey
ALTER TABLE "od_analytiques" ADD CONSTRAINT "od_analytiques_cleRepartitionId_fkey" FOREIGN KEY ("cleRepartitionId") REFERENCES "cles_repartition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cles_repartition" ADD CONSTRAINT "cles_repartition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cles_repartition" ADD CONSTRAINT "cles_repartition_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cles_repartition" ADD CONSTRAINT "cles_repartition_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans_analytiques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cles_repartition" ADD CONSTRAINT "cles_repartition_sectionSourceId_fkey" FOREIGN KEY ("sectionSourceId") REFERENCES "sections_analytiques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_cle_repartition" ADD CONSTRAINT "lignes_cle_repartition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_cle_repartition" ADD CONSTRAINT "lignes_cle_repartition_cleId_fkey" FOREIGN KEY ("cleId") REFERENCES "cles_repartition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_cle_repartition" ADD CONSTRAINT "lignes_cle_repartition_sectionCibleId_fkey" FOREIGN KEY ("sectionCibleId") REFERENCES "sections_analytiques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couts_production_declares" ADD CONSTRAINT "couts_production_declares_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couts_production_declares" ADD CONSTRAINT "couts_production_declares_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "couts_production_declares" ADD CONSTRAINT "couts_production_declares_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections_analytiques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Gardes de la base · la part variable n'a de sens que pour une charge
-- semi-variable, strictement entre zéro et cent (à zéro ou à cent, la charge
-- est fixe ou variable, et se déclare comme telle).
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_part_variable_gestion"
  CHECK (("comportementGestion" = 'CHARGE_SEMI_VARIABLE' AND "partVariableGestionPct" > 0 AND "partVariableGestionPct" < 100)
      OR ("comportementGestion" IS DISTINCT FROM 'CHARGE_SEMI_VARIABLE' AND "partVariableGestionPct" IS NULL));

ALTER TABLE "lignes_cle_repartition" ADD CONSTRAINT "lignes_cle_repartition_valeur_positive" CHECK ("valeur" > 0);

ALTER TABLE "couts_production_declares" ADD CONSTRAINT "couts_production_declares_bornes"
  CHECK ("capaciteNormale" > 0 AND "activiteReelle" >= 0 AND ("quantiteProduite" IS NULL OR "quantiteProduite" > 0));
