-- Identifiants légaux propres aux entités à but non lucratif congolaises.
-- Voir docs/identifiants-legaux-ebnl-rdc.md pour la démonstration complète.
--
-- Ce qui fonde l'existence d'une ASBL n'est pas un numéro de registre (elle
-- n'est pas assujettie au RCCM : elle n'est pas commerçante au sens de
-- l'art. 2 AUDCG, et la loi 004/2001 ne l'y soumet nulle part) mais l'ACTE
-- qui lui accorde la personnalité juridique · arrêté du Ministre de la
-- Justice (art. 3) ou décret présidentiel si elle est de droit étranger
-- (art. 30). Tous ces champs sont facultatifs : une entité peut fonctionner
-- six mois sous autorisation provisoire avant d'obtenir son arrêté (art. 5).
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "actePersonnaliteJuridique" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "dateActePersonnalite" TIMESTAMP(3);
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "numeroEnregistrementSecteur" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "certificatEnregistrementPlan" TEXT;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "attestationExemptionIs" TEXT;
