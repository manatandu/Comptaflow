-- Groupe d'établissements · une même personne morale tenue en plusieurs
-- dossiers (dossier mère + cellules). Le lien autorise le dossier mère à
-- lire les balances de ses cellules pour la balance agrégée (GroupeService) ·
-- il est posé depuis la console plateforme uniquement.
ALTER TABLE "tenants" ADD COLUMN "dossierMereId" TEXT;
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_dossierMereId_fkey"
  FOREIGN KEY ("dossierMereId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "tenants_dossierMereId_idx" ON "tenants"("dossierMereId");
