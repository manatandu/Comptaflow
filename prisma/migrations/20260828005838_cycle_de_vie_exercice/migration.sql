-- CreateEnum
CREATE TYPE "ModeReportANouveau" AS ENUM ('AUCUN', 'SOLDE', 'DETAIL');

-- CreateEnum
CREATE TYPE "GranulariteCloture" AS ENUM ('PARTIELLE', 'TOTALE', 'PERIODE');

-- AlterTable
ALTER TABLE "comptes" ADD COLUMN     "modeReportANouveau" "ModeReportANouveau" NOT NULL DEFAULT 'SOLDE';

-- AlterTable
ALTER TABLE "ecritures" ADD COLUMN     "estGenereeParCloture" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "clotures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "granularite" "GranulariteCloture" NOT NULL,
    "journalId" TEXT,
    "dateLimite" TIMESTAMP(3) NOT NULL,
    "annulable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "annuleeAt" TIMESTAMP(3),
    "annuleeBy" TEXT,

    CONSTRAINT "clotures_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "clotures" ADD CONSTRAINT "clotures_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clotures" ADD CONSTRAINT "clotures_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clotures" ADD CONSTRAINT "clotures_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journaux"("id") ON DELETE SET NULL ON UPDATE CASCADE;
