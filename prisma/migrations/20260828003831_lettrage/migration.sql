-- AlterTable
ALTER TABLE "lignes_ecriture" ADD COLUMN     "lettre" TEXT;

-- CreateIndex
CREATE INDEX "lignes_ecriture_compteId_lettre_idx" ON "lignes_ecriture"("compteId", "lettre");
