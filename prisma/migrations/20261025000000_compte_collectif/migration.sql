-- Compte collectif d'un compte individuel de tiers (point 13 de la comparaison
-- Sage i7). Voir Compte.collectifId dans le schéma.

-- AlterTable
ALTER TABLE "comptes" ADD COLUMN     "collectifId" TEXT;

-- AddForeignKey
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_collectifId_fkey" FOREIGN KEY ("collectifId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

