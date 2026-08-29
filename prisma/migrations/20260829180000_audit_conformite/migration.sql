-- Audit de conformité du 29 août 2026 · trois manques structurels comblés.
--
-- 1. ASSUJETTISSEMENT À LA TVA (ordonnance-loi n° 10/001, art. 14 ; décret
--    n° 011/42, art. 42-43 · seuil de 80 000 000 FC de CA annuel HT). Une ASBL
--    n'est pas assujettie de plein droit : le logiciel proposait pourtant la
--    saisie « avec TVA » à tout dossier. Défaut `false` · l'assujettissement se
--    déclare, il ne se présume pas.
-- 2. EFFECTIF PERMANENT · troisième critère de l'art. 19 SYCEBNL (au-delà de
--    vingt personnes, auditeur obligatoire) et tranche de cotisation INPP.
-- 3. COORDONNÉES DES TIERS · sans elles, les lettres de relance déjà produites
--    par le logiciel ne partaient nulle part ; et la liste annuelle des
--    fournisseurs (art. 47 ter LPF) exige le Numéro Impôt de chacun.

ALTER TABLE "tenants" ADD COLUMN "assujettiTva" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "tenants" ADD COLUMN "dateOptionTva" TIMESTAMP(3);
ALTER TABLE "tenants" ADD COLUMN "effectifPermanent" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "tiers" ADD COLUMN "adresse" TEXT;
ALTER TABLE "tiers" ADD COLUMN "boitePostale" TEXT;
ALTER TABLE "tiers" ADD COLUMN "ville" TEXT;
ALTER TABLE "tiers" ADD COLUMN "pays" TEXT;
ALTER TABLE "tiers" ADD COLUMN "telephone" TEXT;
ALTER TABLE "tiers" ADD COLUMN "email" TEXT;
ALTER TABLE "tiers" ADD COLUMN "numeroImpot" TEXT;
ALTER TABLE "tiers" ADD COLUMN "contact" TEXT;
