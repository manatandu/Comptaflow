-- CreateEnum
CREATE TYPE "NatureResultatInterne" AS ENUM ('STOCK', 'IMMOBILISATION');

-- CreateTable
CREATE TABLE "resultats_internes_consolidation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "vendeuseId" TEXT,
    "acheteuseId" TEXT,
    "nature" "NatureResultatInterne" NOT NULL,
    "compteActif" TEXT NOT NULL,
    "margeOuverture" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "margeCloture" DECIMAL(18,2) NOT NULL,
    "libelle" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resultats_internes_consolidation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "resultats_internes_consolidation_tenantId_exerciceId_idx" ON "resultats_internes_consolidation"("tenantId", "exerciceId");

-- AddForeignKey
ALTER TABLE "resultats_internes_consolidation" ADD CONSTRAINT "resultats_internes_consolidation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultats_internes_consolidation" ADD CONSTRAINT "resultats_internes_consolidation_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultats_internes_consolidation" ADD CONSTRAINT "resultats_internes_consolidation_vendeuseId_fkey" FOREIGN KEY ("vendeuseId") REFERENCES "entites_perimetre_consolidation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultats_internes_consolidation" ADD CONSTRAINT "resultats_internes_consolidation_acheteuseId_fkey" FOREIGN KEY ("acheteuseId") REFERENCES "entites_perimetre_consolidation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

