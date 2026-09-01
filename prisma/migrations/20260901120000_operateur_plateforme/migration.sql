-- Opérateur de plateforme (console multi-cabinets) · drapeau hors DTO,
-- accordé uniquement par le bootstrap OPERATEURS_PLATEFORME au démarrage.
ALTER TABLE "users" ADD COLUMN "estOperateurPlateforme" BOOLEAN NOT NULL DEFAULT false;
