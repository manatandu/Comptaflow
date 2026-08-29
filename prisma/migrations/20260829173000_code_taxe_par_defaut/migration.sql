-- CODE TAXE PAR DÉFAUT SUR LE COMPTE
--
-- Sage porte un code taxe sur la fiche compte et le propose automatiquement
-- en saisie (skill sage-i7, comptabilite-generale.md). OmegaX demandait le
-- taux à chaque ligne : une omission ne se voyait qu'à la déclaration.
--
-- Aucune valeur n'est posée par cette migration : le rattachement d'un taux à
-- un compte est un choix de paramétrage propre à chaque dossier, et le
-- deviner depuis le numéro de compte serait faux (tous les achats ne sont pas
-- au taux normal, et une association exonérée n'en a aucun · voir
-- docs/fiscalite-asbl-rdc.md, section 5).
ALTER TABLE "comptes" ADD COLUMN "tauxTvaDefautId" TEXT;
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_tauxTvaDefautId_fkey"
  FOREIGN KEY ("tauxTvaDefautId") REFERENCES "taux_tva"("id") ON DELETE SET NULL ON UPDATE CASCADE;
