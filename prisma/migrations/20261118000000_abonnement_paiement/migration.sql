-- Encaissement déclaré d'une facture d'abonnement · il prolonge la licence du client.

-- AlterTable
ALTER TABLE "factures_abonnement" ADD COLUMN     "payeeLe" DATE;
