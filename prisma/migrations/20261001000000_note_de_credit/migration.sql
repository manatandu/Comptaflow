-- I3 · La note de crédit (O.-L. n° 10/001 art. 52 al. 2 ; décret n° 011/42 art. 127).
-- Purement additive : les factures existantes prennent la nature FACTURE par
-- défaut, aucune n'en annule une autre.

-- CreateEnum
CREATE TYPE "NatureFacture" AS ENUM ('FACTURE', 'NOTE_DE_CREDIT');

-- AlterTable
ALTER TABLE "factures" ADD COLUMN     "factureAnnuleeId" TEXT,
ADD COLUMN     "nature" "NatureFacture" NOT NULL DEFAULT 'FACTURE';

-- CreateIndex
CREATE UNIQUE INDEX "factures_factureAnnuleeId_key" ON "factures"("factureAnnuleeId");

-- AddForeignKey · RESTRICT : la facture annulée se conserve (décret art. 127).
ALTER TABLE "factures" ADD CONSTRAINT "factures_factureAnnuleeId_fkey" FOREIGN KEY ("factureAnnuleeId") REFERENCES "factures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
