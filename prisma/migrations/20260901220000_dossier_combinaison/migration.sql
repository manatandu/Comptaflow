-- Dossier de combinaison · le dossier technique où le serveur reverse la
-- balance agrégée d'un groupe pour produire la liasse en un clic
-- (GroupeService.liasseGroupe). Sans dossierMereId (l'agrégat le
-- doublerait), exclu des listes de la console par la relation inverse.
ALTER TABLE "tenants" ADD COLUMN "dossierCombinaisonId" TEXT;
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_dossierCombinaisonId_key" UNIQUE ("dossierCombinaisonId");
ALTER TABLE "tenants" ADD CONSTRAINT "tenants_dossierCombinaisonId_fkey"
  FOREIGN KEY ("dossierCombinaisonId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
