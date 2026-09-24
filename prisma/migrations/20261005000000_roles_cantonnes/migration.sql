-- DEUX RÔLES CANTONNÉS (plan, item 13, décision du 2026-09-24) · l'aide-
-- comptable, qui saisit au brouillard sans valider ni passer la paie, et le
-- gestionnaire de paie, qui n'accède qu'au personnel et à la paie. Ajout de
-- valeurs seulement : aucun utilisateur existant ne change de rôle.
ALTER TYPE "RoleUtilisateur" ADD VALUE IF NOT EXISTS 'AIDE_COMPTABLE';
ALTER TYPE "RoleUtilisateur" ADD VALUE IF NOT EXISTS 'GESTIONNAIRE_PAIE';
