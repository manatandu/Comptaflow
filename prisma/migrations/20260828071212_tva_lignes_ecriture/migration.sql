-- AlterTable
ALTER TABLE "lignes_ecriture" ADD COLUMN     "tauxTvaId" TEXT;

-- AddForeignKey
ALTER TABLE "lignes_ecriture" ADD CONSTRAINT "lignes_ecriture_tauxTvaId_fkey" FOREIGN KEY ("tauxTvaId") REFERENCES "taux_tva"("id") ON DELETE SET NULL ON UPDATE CASCADE;
