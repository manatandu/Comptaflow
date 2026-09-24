-- CreateEnum
CREATE TYPE "ModeEcartEvaluation" AS ENUM ('AMORTISSABLE', 'NON_AMORTISSABLE', 'REALISE');

-- AlterTable
ALTER TABLE "entites_perimetre_consolidation" ADD COLUMN     "idaCloture" DECIMAL(18,2),
ADD COLUMN     "idaOuverture" DECIMAL(18,2),
ADD COLUMN     "idpCloture" DECIMAL(18,2),
ADD COLUMN     "idpOuverture" DECIMAL(18,2),
ADD COLUMN     "justificationIda" TEXT,
ADD COLUMN     "sourceTauxImpot" TEXT,
ADD COLUMN     "tauxImpotDiffere" DECIMAL(7,4);

-- AlterTable
ALTER TABLE "faits_consolidation_exercice" ADD COLUMN     "idaCloture" DECIMAL(18,2),
ADD COLUMN     "idaOuverture" DECIMAL(18,2),
ADD COLUMN     "idpCloture" DECIMAL(18,2),
ADD COLUMN     "idpOuverture" DECIMAL(18,2),
ADD COLUMN     "justificationIda" TEXT,
ADD COLUMN     "sourceTauxImpot" TEXT,
ADD COLUMN     "tauxImpotDiffere" DECIMAL(7,4);

-- CreateTable
CREATE TABLE "ecarts_evaluation_consolidation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "lienId" TEXT NOT NULL,
    "compte" TEXT NOT NULL,
    "compteAmortissement" TEXT,
    "libelle" TEXT NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "mode" "ModeEcartEvaluation" NOT NULL,
    "dureeAnnees" INTEGER,
    "dateRealisation" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ecarts_evaluation_consolidation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ecarts_evaluation_consolidation_tenantId_exerciceId_idx" ON "ecarts_evaluation_consolidation"("tenantId", "exerciceId");

-- AddForeignKey
ALTER TABLE "ecarts_evaluation_consolidation" ADD CONSTRAINT "ecarts_evaluation_consolidation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecarts_evaluation_consolidation" ADD CONSTRAINT "ecarts_evaluation_consolidation_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecarts_evaluation_consolidation" ADD CONSTRAINT "ecarts_evaluation_consolidation_lienId_fkey" FOREIGN KEY ("lienId") REFERENCES "liens_participation_consolidation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

