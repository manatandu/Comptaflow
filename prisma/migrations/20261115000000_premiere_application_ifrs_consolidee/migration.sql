-- Première application des IFRS aux comptes consolidés (IFRS 1) · déclarée à
-- part de celle des comptes individuels, avec le choix de l'exemption C1.

-- AlterTable
ALTER TABLE "parametres_ifrs" ADD COLUMN     "dejaAdoptantConsolide" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "exemptionRegroupementsC1" BOOLEAN,
ADD COLUMN     "premierExerciceIfrsConsolideId" TEXT;

