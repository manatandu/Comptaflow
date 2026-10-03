-- LIGNE A7, quatrième relecture · la TVA déclarée se FIGE à la liquidation.
--
-- Chaque passe trouvait un cas où la TVA « telle que déclarée » était
-- reconstituée de travers, sur des lettrages qui avaient bougé depuis. La
-- liquidation enregistre désormais, vente par vente (ligne de TVA collectée),
-- ce qu'elle a rendu exigible dans sa période (tva_ventes_declarees, supprimée
-- avec elle). Une liquidation antérieure garde tvaVentesFigee à faux · sa TVA
-- se lit reconstituée, et c'est dit. La régularisation d'un mouvement annulé
-- après liquidation s'impute dans la prochaine déclaration, une seule fois
-- (regularisations_tva_creances · O.-L. n° 10/001, art. 52 ; décret n° 011/42,
-- art. 126).

-- CreateEnum
CREATE TYPE "SensRegularisationTvaCreance" AS ENUM ('DEDUCTION', 'REVERSEMENT');

-- AlterTable
ALTER TABLE "liquidations_tva" ADD COLUMN     "tvaVentesFigee" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "mouvements_creances_douteuses" ADD COLUMN     "tvaDeclareePerte" DECIMAL(18,2),
ADD COLUMN     "tvaDejaDeclareeSource" TEXT,
ADD COLUMN     "tvaEnDepend" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "tva_ventes_declarees" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "liquidationId" TEXT NOT NULL,
    "ligneEcritureId" TEXT NOT NULL,
    "ecritureId" TEXT NOT NULL,
    "recouvrementId" TEXT,
    "montant" DECIMAL(18,2) NOT NULL,
    "dateExigibilite" DATE NOT NULL,
    "reportee" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "tva_ventes_declarees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regularisations_tva_creances" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "mouvementId" TEXT NOT NULL,
    "sens" "SensRegularisationTvaCreance" NOT NULL,
    "date" DATE NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "compteId" TEXT NOT NULL,
    "tauxTvaId" TEXT NOT NULL,
    "ecritureVenteId" TEXT,
    "liquidationImputationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "regularisations_tva_creances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tva_ventes_declarees_tenantId_idx" ON "tva_ventes_declarees"("tenantId");

-- CreateIndex
CREATE INDEX "tva_ventes_declarees_liquidationId_idx" ON "tva_ventes_declarees"("liquidationId");

-- CreateIndex
CREATE INDEX "tva_ventes_declarees_ligneEcritureId_idx" ON "tva_ventes_declarees"("ligneEcritureId");

-- CreateIndex
CREATE INDEX "tva_ventes_declarees_ecritureId_idx" ON "tva_ventes_declarees"("ecritureId");

-- CreateIndex
CREATE INDEX "tva_ventes_declarees_recouvrementId_idx" ON "tva_ventes_declarees"("recouvrementId");

-- CreateIndex
CREATE INDEX "regularisations_tva_creances_tenantId_idx" ON "regularisations_tva_creances"("tenantId");

-- CreateIndex
CREATE INDEX "regularisations_tva_creances_mouvementId_idx" ON "regularisations_tva_creances"("mouvementId");

-- CreateIndex
CREATE INDEX "regularisations_tva_creances_liquidationImputationId_idx" ON "regularisations_tva_creances"("liquidationImputationId");

-- AddForeignKey
ALTER TABLE "tva_ventes_declarees" ADD CONSTRAINT "tva_ventes_declarees_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tva_ventes_declarees" ADD CONSTRAINT "tva_ventes_declarees_liquidationId_fkey" FOREIGN KEY ("liquidationId") REFERENCES "liquidations_tva"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tva_ventes_declarees" ADD CONSTRAINT "tva_ventes_declarees_ligneEcritureId_fkey" FOREIGN KEY ("ligneEcritureId") REFERENCES "lignes_ecriture"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tva_ventes_declarees" ADD CONSTRAINT "tva_ventes_declarees_recouvrementId_fkey" FOREIGN KEY ("recouvrementId") REFERENCES "mouvements_creances_douteuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisations_tva_creances" ADD CONSTRAINT "regularisations_tva_creances_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisations_tva_creances" ADD CONSTRAINT "regularisations_tva_creances_mouvementId_fkey" FOREIGN KEY ("mouvementId") REFERENCES "mouvements_creances_douteuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisations_tva_creances" ADD CONSTRAINT "regularisations_tva_creances_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "regularisations_tva_creances" ADD CONSTRAINT "regularisations_tva_creances_liquidationImputationId_fkey" FOREIGN KEY ("liquidationImputationId") REFERENCES "liquidations_tva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

