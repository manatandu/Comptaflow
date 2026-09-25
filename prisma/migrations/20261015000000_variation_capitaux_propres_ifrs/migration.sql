-- CreateEnum
CREATE TYPE "TypeMouvementCpIfrs" AS ENUM ('CHANGEMENT_METHODE', 'CORRECTION_ERREUR', 'APPORT', 'DISTRIBUTION', 'TRANSFERT');

-- CreateEnum
CREATE TYPE "ComposanteCpIfrs" AS ENUM ('CAPITAL', 'RESERVES', 'AUTRES_COMPOSANTES');

-- CreateTable
CREATE TABLE "mouvements_capitaux_propres_ifrs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "type" "TypeMouvementCpIfrs" NOT NULL,
    "composante" "ComposanteCpIfrs" NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "libelle" TEXT NOT NULL,
    "justification" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mouvements_capitaux_propres_ifrs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mouvements_capitaux_propres_ifrs_tenantId_exerciceId_idx" ON "mouvements_capitaux_propres_ifrs"("tenantId", "exerciceId");

-- AddForeignKey
ALTER TABLE "mouvements_capitaux_propres_ifrs" ADD CONSTRAINT "mouvements_capitaux_propres_ifrs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mouvements_capitaux_propres_ifrs" ADD CONSTRAINT "mouvements_capitaux_propres_ifrs_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

