-- CreateEnum
CREATE TYPE "FonctionLigneModele" AS ENUM ('SAISIR', 'REPETER', 'CALCULER', 'EQUILIBRER');

-- AlterTable
ALTER TABLE "lignes_modele_saisie" ADD COLUMN     "fonction" "FonctionLigneModele" NOT NULL DEFAULT 'SAISIR',
ADD COLUMN     "tauxTvaId" TEXT;

-- AlterTable
ALTER TABLE "modeles_saisie" ADD COLUMN     "typeJournal" "TypeJournal";

-- AddForeignKey
ALTER TABLE "lignes_modele_saisie" ADD CONSTRAINT "lignes_modele_saisie_tauxTvaId_fkey" FOREIGN KEY ("tauxTvaId") REFERENCES "taux_tva"("id") ON DELETE SET NULL ON UPDATE CASCADE;

