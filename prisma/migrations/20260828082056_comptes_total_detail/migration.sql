-- CreateEnum
CREATE TYPE "TypeCompteDetailTotal" AS ENUM ('DETAIL', 'TOTAL');

-- AlterTable
ALTER TABLE "comptes" ADD COLUMN     "typeCompte" "TypeCompteDetailTotal" NOT NULL DEFAULT 'DETAIL';
