-- Ligne A7 ter, relecture adverse. Deux ajouts, aucune ligne réécrite.
--
-- (1) L'origine MODULE d'un groupe de lettrage · le groupe qu'un module pose
-- sur ses propres lignes (les lignes 416 d'une créance douteuse éteinte) se
-- distingue d'un lettrage manuel ou automatique. Seul un groupe de cette
-- origine est défait par le module à l'annulation d'un mouvement ; un groupe
-- composé à la main sur les mêmes lignes reste au lettrage.
ALTER TYPE "OrigineLettrage" ADD VALUE 'MODULE';

-- (2) Les créances d'un compte client se lisent par ce compte (contrôle des
-- tiers anciens, règlement des tiers, échéances) · sans index, chaque lecture
-- balaie la table.
CREATE INDEX "creances_douteuses_compteCreanceId_idx" ON "creances_douteuses"("compteCreanceId");
