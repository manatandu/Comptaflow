-- Tableau des flux IFRS consolidé (IAS 7) · la trésorerie du groupe en devises
-- se déclare à part de celle du dossier, et l'effet de change consolidé ne se
-- lit jamais pour l'effet individuel.

-- DropIndex
DROP INDEX "effets_change_tresorerie_ifrs_tenantId_exerciceId_key";

-- AlterTable
ALTER TABLE "effets_change_tresorerie_ifrs" ADD COLUMN     "consolide" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "parametres_ifrs" ADD COLUMN     "tresorerieGroupeEnDevises" BOOLEAN;

-- CreateIndex
CREATE UNIQUE INDEX "effets_change_tresorerie_ifrs_tenantId_exerciceId_consolide_key" ON "effets_change_tresorerie_ifrs"("tenantId", "exerciceId", "consolide");

