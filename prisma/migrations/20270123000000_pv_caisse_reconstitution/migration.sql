-- LIGNE A10 · caisse comptée après la clôture (relevé CPCC C6, décision de
-- Manasse du 2026-10-02).
--
-- Fiche du compte 57 des deux plans, « le solde du compte caisse doit toujours
-- correspondre exactement à la somme disponible réellement » ; AUDCIF art. 16,
-- al. 4 et 5 (valeur « à la date de l'inventaire », données « organisées et
-- conservées de manière à justifier »), art. 42 (recensement à la clôture).
-- Compté après la clôture, le PV fige le solde du livre-journal à la date du
-- comptage et sa reconstitution vers la clôture · solde à la clôture,
-- opérations de l'exercice suivant à date de valeur antérieure à la clôture,
-- encaissements et décaissements postérieurs, nombre de lignes lues. Nulles sur
-- un comptage antérieur ou égal à la clôture, et sur les PV d'avant la règle.
--
-- Seconde passe (B1) · l'unité de la comparaison. Une caisse en devises
-- (5712 au SYSCOHADA, 572 au SYCEBNL) se compte dans sa devise quand toutes ses
-- lignes lues la portent ; sinon en francs, au cours historique, et le PV le
-- dit. Les PV existants restent en FRANCS.
-- Jamais appliquée hors bases jetables à sa réécriture (2026-10-03).

-- CreateEnum
CREATE TYPE "ModeComparaisonCaisse" AS ENUM ('FRANCS', 'DEVISE', 'FRANCS_COURS_HISTORIQUES');

-- AlterTable
ALTER TABLE "proces_verbaux_comptage_caisse" ADD COLUMN     "decaissementsPosterieurs" DECIMAL(18,2),
ADD COLUMN     "deviseId" TEXT,
ADD COLUMN     "encaissementsPosterieurs" DECIMAL(18,2),
ADD COLUMN     "modeComparaison" "ModeComparaisonCaisse" NOT NULL DEFAULT 'FRANCS',
ADD COLUMN     "mouvementsPosterieurs" INTEGER,
ADD COLUMN     "mouvementsValeurAvantCloture" DECIMAL(18,2),
ADD COLUMN     "soldeALaCloture" DECIMAL(18,2);

-- AddForeignKey
ALTER TABLE "proces_verbaux_comptage_caisse" ADD CONSTRAINT "proces_verbaux_comptage_caisse_deviseId_fkey" FOREIGN KEY ("deviseId") REFERENCES "devises"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
