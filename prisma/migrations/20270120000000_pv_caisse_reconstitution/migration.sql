-- LIGNE A10 · caisse comptée après la clôture (relevé CPCC C6, décision de
-- Manasse du 2026-10-02).
--
-- Fiche du compte 57 des deux plans, « le solde du compte caisse doit toujours
-- correspondre exactement à la somme disponible réellement » ; AUDCIF art. 16,
-- al. 4 et 5 (valeur « à la date de l'inventaire », données « organisées et
-- conservées de manière à justifier »), art. 42 (recensement à la clôture).
-- Compté après la clôture, le PV fige le solde du livre-journal à la date du
-- comptage et sa reconstitution vers la clôture · solde à la clôture,
-- encaissements et décaissements postérieurs, nombre de lignes lues. Nulles sur
-- un comptage antérieur ou égal à la clôture, et sur les PV d'avant la règle.

-- AlterTable
ALTER TABLE "proces_verbaux_comptage_caisse" ADD COLUMN     "decaissementsPosterieurs" DECIMAL(18,2),
ADD COLUMN     "encaissementsPosterieurs" DECIMAL(18,2),
ADD COLUMN     "mouvementsPosterieurs" INTEGER,
ADD COLUMN     "soldeALaCloture" DECIMAL(18,2);
