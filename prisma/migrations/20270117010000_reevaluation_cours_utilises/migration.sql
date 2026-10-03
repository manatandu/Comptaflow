-- Ligne A6, décision D5 (2026-10-03) · le cours retenu par devise est gardé
-- sur la réévaluation · `poserCours` remplace le cours d'une date sans trace.
-- Nul sur les réévaluations déjà passées, qui ne l'ont pas enregistré.
ALTER TABLE "reevaluations" ADD COLUMN "coursUtilises" JSONB;
