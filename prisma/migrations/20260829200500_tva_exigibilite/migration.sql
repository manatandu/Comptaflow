-- Régime d'exigibilité de la TVA (O.-L. n° 10/001, art. 25 et 26).
--
-- La déclaration comptait la TVA collectée par DATE D'ÉCRITURE. C'est juste
-- pour une vente de bien (exigible à la livraison, art. 25, 1°) et faux pour
-- une prestation de services, exigible « au moment de l'encaissement du prix,
-- des acomptes ou avances » (art. 25, 2°) : une facture de mars réglée en juin
-- se déclare en juin. Un dossier de services déclarait donc, chaque mois, une
-- TVA qu'il n'avait pas encore encaissée.
--
-- LIVRAISONS par défaut : c'est le régime qui reproduit exactement le
-- comportement actuel. Aucun dossier existant ne change de déclaration du seul
-- fait de cette migration · le passage à l'encaissement est une décision, pas
-- un effet de bord.
CREATE TYPE "RegimeExigibiliteTva" AS ENUM ('LIVRAISONS', 'ENCAISSEMENTS', 'DEBITS');

ALTER TABLE "tenants"
  ADD COLUMN "regimeExigibiliteTva" "RegimeExigibiliteTva" NOT NULL DEFAULT 'LIVRAISONS',
  ADD COLUMN "dateAutorisationDebitsTva" TIMESTAMP(3);
