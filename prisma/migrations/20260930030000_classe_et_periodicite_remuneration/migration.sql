-- CreateEnum
CREATE TYPE "PeriodiciteRemuneration" AS ENUM ('JOUR', 'SEMAINE', 'MOIS', 'ANNEE');

-- AlterTable
ALTER TABLE "contrats_travail" ADD COLUMN     "classeProfessionnelle" INTEGER,
ADD COLUMN     "periodiciteRemuneration" "PeriodiciteRemuneration";

