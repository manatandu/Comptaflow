-- Passe O4-C2 · la saisie-arrêt notifiée se tient au registre des avances
-- (Code du travail, art. 112, g ; AUPSRVE, art. 183 à 189). Colonnes
-- NULLABLES, aucune ligne existante n'est réécrite.
ALTER TYPE "TypeAvanceSalaire" ADD VALUE 'SAISIE_ARRET';

ALTER TABLE "avances_salaire"
  ADD COLUMN "referenceActe" TEXT,
  ADD COLUMN "greffe" TEXT,
  ADD COLUMN "destinataire" TEXT,
  ADD COLUMN "dateFin" DATE;
