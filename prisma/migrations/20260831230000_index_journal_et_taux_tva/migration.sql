-- Index de performance, prouvés par des requêtes réelles :
-- 1. La numérotation des pièces agrège les écritures d'un journal à chaque
--    création (journal.service) · sans index, balayage de tout le dossier.
CREATE INDEX IF NOT EXISTS "ecritures_tenantId_journalId_date_idx"
  ON "ecritures" ("tenantId", "journalId", "date");

-- 2. La déclaration de TVA somme les lignes par taux rattaché
--    (taux-tva.service) · tauxTvaId est une FK sans index jusqu'ici.
CREATE INDEX IF NOT EXISTS "lignes_ecriture_tauxTvaId_idx"
  ON "lignes_ecriture" ("tauxTvaId");
