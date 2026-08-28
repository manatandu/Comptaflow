-- CreateEnum
CREATE TYPE "TypeEcheance" AS ENUM ('POURCENTAGE', 'MONTANT', 'EQUILIBRE');

-- CreateTable
CREATE TABLE "echeances_reglement" (
    "id" TEXT NOT NULL,
    "modeleReglementId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "type" "TypeEcheance" NOT NULL,
    "valeur" DECIMAL(12,2),
    "delaiJours" INTEGER NOT NULL,
    "echeance" "ConditionEcheance" NOT NULL DEFAULT 'NET',

    CONSTRAINT "echeances_reglement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "echeances_reglement_modeleReglementId_ordre_key" ON "echeances_reglement"("modeleReglementId", "ordre");

-- AddForeignKey
ALTER TABLE "echeances_reglement" ADD CONSTRAINT "echeances_reglement_modeleReglementId_fkey" FOREIGN KEY ("modeleReglementId") REFERENCES "modeles_reglement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
