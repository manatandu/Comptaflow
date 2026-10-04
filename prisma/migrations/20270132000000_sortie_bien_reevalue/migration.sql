-- Ligne A15 · le sort de l'écart de réévaluation d'un bien sorti (AUDCIF
-- Titre VIII ch. 28 § 6 ; loi n° 23/053, art. 133 al. 3).
--
-- L'écriture qui solde l'écart à la sortie est RETENUE par la fiche
-- (RESTRICT) · retirée seule, les lignes de réévaluation se diraient soldées
-- sans l'écriture qui les solde.
ALTER TABLE "immobilisations" ADD COLUMN "ecritureSortieEcartReevaluationId" TEXT;

CREATE UNIQUE INDEX "immobilisations_ecritureSortieEcartReevaluationId_key" ON "immobilisations"("ecritureSortieEcartReevaluationId");

ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_ecritureSortieEcartReevaluationId_fkey" FOREIGN KEY ("ecritureSortieEcartReevaluationId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- L'écart (106) transféré à une réserve non distribuable à la sortie · zéro
-- pour toutes les lignes existantes, aucune sortie ne l'ayant encore porté.
ALTER TABLE "lignes_reevaluation_bilan" ADD COLUMN "ecartTransfere" DECIMAL(18,2) NOT NULL DEFAULT 0;
