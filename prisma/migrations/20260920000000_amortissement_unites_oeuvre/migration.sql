-- AlterEnum
ALTER TYPE "ModeAmortissement" ADD VALUE 'UNITES_DOEUVRE';

-- AlterTable
ALTER TABLE "immobilisations" ADD COLUMN     "uniteOeuvreLibelle" TEXT,
ADD COLUMN     "unitesOeuvrePrevues" DECIMAL(18,4);

-- CreateTable
CREATE TABLE "consommations_unite_oeuvre" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "immobilisationId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "unitesConsommees" DECIMAL(18,4) NOT NULL,
    "source" TEXT NOT NULL,
    "saisieLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saisiePar" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consommations_unite_oeuvre_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consommations_unite_oeuvre_tenantId_exerciceId_idx" ON "consommations_unite_oeuvre"("tenantId", "exerciceId");

-- CreateIndex
CREATE UNIQUE INDEX "consommations_unite_oeuvre_immobilisationId_exerciceId_key" ON "consommations_unite_oeuvre"("immobilisationId", "exerciceId");

-- AddForeignKey
ALTER TABLE "consommations_unite_oeuvre" ADD CONSTRAINT "consommations_unite_oeuvre_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consommations_unite_oeuvre" ADD CONSTRAINT "consommations_unite_oeuvre_immobilisationId_fkey" FOREIGN KEY ("immobilisationId") REFERENCES "immobilisations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consommations_unite_oeuvre" ADD CONSTRAINT "consommations_unite_oeuvre_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
