-- AMORTISSEMENT ANTÉRIEUR À L'ENTRÉE DANS LE LOGICIEL.
--
-- Le calcul de la dotation ne connaissait que les dotations passées PAR
-- OmegaX. Un bien mis en service en 2020 et repris dans un dossier ouvert en
-- 2026 repartait donc de zéro : il s'amortissait cinq ans de plus que sa durée,
-- et la valeur nette comptable des états cessait de correspondre au solde du
-- compte 28 repris par le bilan d'ouverture.
--
-- Rien ne cassait · les écritures s'équilibraient, aucun total ne bougeait, et
-- le bien restait sous-amorti aussi longtemps que personne ne recoupait la
-- fiche avec le grand livre. C'est la forme d'erreur la plus coûteuse : celle
-- qui ne se signale pas.
--
-- ZÉRO PAR DÉFAUT, ce qui est la valeur juste pour tout bien acquis dans le
-- logiciel · les biens existants ne changent donc pas de comportement. Ceux
-- qui ont été repris avec une mise en service antérieure sont, eux, à corriger
-- à la main : le contrôle IMMO_REPRISE_SANS_ANTERIEUR les signale.
ALTER TABLE "immobilisations"
  ADD COLUMN "amortissementAnterieur" DECIMAL(18,2) NOT NULL DEFAULT 0;
