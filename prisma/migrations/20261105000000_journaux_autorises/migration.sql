-- Journaux autorisés par utilisateur · restriction de la saisie (common/perimetre).

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "journauxAutorises" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "restreindreJournaux" BOOLEAN NOT NULL DEFAULT false;

