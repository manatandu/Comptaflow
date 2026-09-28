-- LA PÉRIODE DE L'AUTORISATION D'ACQUITTER LA TVA D'APRÈS LES DÉBITS, SUR LA
-- FICHE DU FOURNISSEUR.
--
-- `tiers."autoriseTvaDebits"` disait OUI ou NON, sans date. La déclaration
-- anticipait donc la déduction de toute facture du fournisseur, y compris
-- celles antérieures à la décision du Directeur Général des Impôts et celles
-- postérieures au retour au droit commun.
--
-- DÉBUT · décret n° 011/42, art. 59 : la décision « intervient dans les dix
-- jours qui suivent la réception de la demande. L'absence de décision dans ce
-- délai vaut autorisation. »
-- FIN · O.-L. n° 10/001, art. 26 al. 2 (« L'autorisation demeure valable tant
-- que le redevable n'a pas demandé, par écrit, de revenir au régime de droit
-- commun ») et décret n° 011/42, art. 63 (« révocable sur simple demande
-- écrite du contribuable »).
--
-- STRICTEMENT ADDITIVE · deux colonnes nullables, SANS DÉFAUT et sans reprise.
-- Une date posée d'office daterait une décision que personne n'a lue ; un
-- fournisseur autorisé sans date d'effet reste anticipé, et la déclaration dit
-- que l'autorisation n'est pas datée.
ALTER TABLE "tiers"
  ADD COLUMN "dateEffetAutorisationDebits"      TIMESTAMP(3),
  ADD COLUMN "dateRevocationAutorisationDebits" TIMESTAMP(3);
