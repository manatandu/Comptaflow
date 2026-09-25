-- Profil de fonctions par utilisateur (point 15 de la comparaison Sage i7).
-- Voir User.restreindreFonctions dans le schéma.

-- CreateEnum
CREATE TYPE "FonctionMetier" AS ENUM ('STRUCTURE', 'TIERS', 'SAISIE', 'VALIDATION', 'LETTRAGE', 'TRESORERIE', 'RELANCES', 'IMMOBILISATIONS', 'STOCKS', 'ANALYTIQUE', 'FISCALITE', 'GESTION_COMMERCIALE', 'PAIE', 'CLOTURE', 'REVISION', 'GROUPE_ET_IFRS');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "fonctionsAutorisees" "FonctionMetier"[] DEFAULT ARRAY[]::"FonctionMetier"[],
ADD COLUMN     "restreindreFonctions" BOOLEAN NOT NULL DEFAULT false;

