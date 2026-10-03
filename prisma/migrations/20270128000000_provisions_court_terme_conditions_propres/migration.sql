-- Ligne A16 (2026-10-03) · registre des provisions · le risque à moins d'un
-- an se porte au 499 ou au 599 et non au 19 (AUDCIF, fiche du compte 49 ;
-- SYCEBNL, fiche du compte 19, exclusions), et les conditions propres de la
-- restructuration, du contrat déficitaire et du déménagement (AUDCIF Titre
-- VIII ch. 18 § 4.1, § 4.3, § 4.10) se cochent une à une. Les lignes déjà
-- saisies restent à plus d'un an, sans condition cochée.
ALTER TABLE "provisions_risques_charges" ADD COLUMN "courtTerme" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "provisions_risques_charges" ADD COLUMN "conditionsPropres" JSONB;
