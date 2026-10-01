-- Lot 8 · ventilation d'un prix global et composant non identifié à l'origine.
-- AUDCIF art. 38 ; Titre VIII ch. 11 § 1.7.1, ch. 2 § 7.2.1, ch. 4 § 3.1.2 et § 4.2.

CREATE TYPE "MethodeEstimationPartie" AS ENUM ('COUT_ACTUEL_A_NEUF', 'POURCENTAGE_IMMOBILISATIONS_RECENTES', 'INFORMATIONS_FOURNISSEURS', 'DEPENSES_DE_RENOUVELLEMENT');

ALTER TABLE "immobilisations"
  ADD COLUMN "amortissementsDetaches" DECIMAL(18,2) NOT NULL DEFAULT 0,
  ADD COLUMN "modaliteVentilation" TEXT,
  ADD COLUMN "methodeEstimationPartie" "MethodeEstimationPartie",
  ADD COLUMN "sourceEstimationPartie" TEXT;
