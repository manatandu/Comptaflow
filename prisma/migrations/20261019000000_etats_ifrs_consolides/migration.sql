-- AlterTable
ALTER TABLE "retraitements_ifrs" ADD COLUMN     "consolide" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partMinoritairesCapitauxPropres" DECIMAL(18,2),
ADD COLUMN     "partMinoritairesOci" DECIMAL(18,2),
ADD COLUMN     "partMinoritairesResultat" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "regles_consolidation_ifrs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "poste" VARCHAR(64) NOT NULL,
    "rubrique" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "regles_consolidation_ifrs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regles_consolidation_ifrs_tenantId_poste_key" ON "regles_consolidation_ifrs"("tenantId", "poste");

-- AddForeignKey
ALTER TABLE "regles_consolidation_ifrs" ADD CONSTRAINT "regles_consolidation_ifrs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

