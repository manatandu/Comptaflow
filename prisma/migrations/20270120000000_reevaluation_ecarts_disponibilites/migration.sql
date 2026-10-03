-- Ligne A5 bis (2026-10-03) · l'écart de chaque disponibilité, par compte et
-- par devise, est gardé sur la réévaluation · AUDCIF art. 57, il est réalisé
-- et ne se contre-passe plus ; la réévaluation suivante le relit. Nul sur les
-- réévaluations déjà passées.
ALTER TABLE "reevaluations" ADD COLUMN "ecartsDisponibilites" JSONB;
