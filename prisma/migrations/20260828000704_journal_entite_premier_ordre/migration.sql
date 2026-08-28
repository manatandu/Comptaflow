/*
  Warnings:

  - You are about to drop the column `journalCode` on the `ecritures` table. All the data in the column will be lost.
  - Added the required column `journalId` to the `ecritures` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "TypeJournal" AS ENUM ('ACHATS', 'VENTES', 'TRESORERIE', 'GENERAL', 'SITUATION');

-- CreateEnum
CREATE TYPE "NumerotationPiece" AS ENUM ('MANUELLE', 'CONTINUE_JOURNAL', 'CONTINUE_FICHIER', 'MENSUELLE');

-- AlterTable
ALTER TABLE "ecritures" DROP COLUMN "journalCode",
ADD COLUMN     "journalId" TEXT NOT NULL,
ADD COLUMN     "numeroPiece" INTEGER;

-- CreateTable
CREATE TABLE "journaux" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "type" "TypeJournal" NOT NULL,
    "compteTresorerieId" TEXT,
    "numerotation" "NumerotationPiece" NOT NULL DEFAULT 'MANUELLE',
    "estActif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "journaux_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "journaux_tenantId_code_key" ON "journaux"("tenantId", "code");

-- AddForeignKey
ALTER TABLE "journaux" ADD CONSTRAINT "journaux_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journaux" ADD CONSTRAINT "journaux_compteTresorerieId_fkey" FOREIGN KEY ("compteTresorerieId") REFERENCES "comptes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecritures" ADD CONSTRAINT "ecritures_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journaux"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
