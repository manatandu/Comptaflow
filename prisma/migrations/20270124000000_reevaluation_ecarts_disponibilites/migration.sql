-- Ligne A5 bis (2026-10-03) · l'écart de chaque disponibilité, par compte et
-- par devise, est gardé sur la réévaluation · AUDCIF art. 57, il est réalisé
-- et ne se contre-passe plus ; la réévaluation suivante le relit. Nul sur les
-- réévaluations déjà passées.
ALTER TABLE "reevaluations" ADD COLUMN "ecartsDisponibilites" JSONB;

-- Relecture adverse d'A5 bis · la ventilation déclarée d'un écart passé sans
-- devise sur une banque à plusieurs devises (B1), la contre-passation
-- intégrale par exception nommée (B2, M2), et la trace des contre-passations
-- annulées pour être repassées dans l'exercice qui suit (M1).
ALTER TABLE "reevaluations" ADD COLUMN "ventilationDisponibilites" JSONB;
ALTER TABLE "reevaluations" ADD COLUMN "ventilationDisponibilitesSource" TEXT;
ALTER TABLE "reevaluations" ADD COLUMN "ventilationDisponibilitesLe" TIMESTAMP(3);
ALTER TABLE "reevaluations" ADD COLUMN "ventilationDisponibilitesPar" TEXT;
ALTER TABLE "reevaluations" ADD COLUMN "contrePassationIntegrale" TEXT;
ALTER TABLE "reevaluations" ADD COLUMN "annulationsContrePassation" JSONB;
