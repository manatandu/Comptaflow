-- AlterTable
ALTER TABLE "parametres_ifrs" ADD COLUMN     "dejaAdoptant" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "premierExerciceIfrsId" TEXT;

-- AlterTable
ALTER TABLE "retraitements_ifrs" ADD COLUMN     "aLaTransition" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "correctionErreur" BOOLEAN NOT NULL DEFAULT false;

