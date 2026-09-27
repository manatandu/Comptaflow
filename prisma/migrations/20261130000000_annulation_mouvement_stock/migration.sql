-- Audit final F133 · l'annulation motivée d'un mouvement de magasin. Le
-- mouvement annulé reste sur la fiche, hors de la valorisation.
ALTER TABLE "mouvements_stock" ADD COLUMN "annuleLe" TIMESTAMP(3);
ALTER TABLE "mouvements_stock" ADD COLUMN "annulePar" TEXT;
ALTER TABLE "mouvements_stock" ADD COLUMN "motifAnnulation" TEXT;
