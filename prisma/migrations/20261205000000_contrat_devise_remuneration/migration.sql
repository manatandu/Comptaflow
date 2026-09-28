-- Audit final F226 · la monnaie de la rémunération convenue au contrat.
-- Nulle pour les contrats déjà saisis · rien ne dit en quelle monnaie leur
-- montant a été porté, et le contrôle du minimum s'abstient tant qu'elle
-- n'est pas déclarée.
ALTER TABLE "contrats_travail" ADD COLUMN "deviseRemuneration" TEXT;
