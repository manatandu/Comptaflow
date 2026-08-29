CREATE TYPE "StatutEcriture" AS ENUM ('BROUILLARD', 'VALIDEE');

ALTER TABLE "ecritures" ADD COLUMN "statut" "StatutEcriture" NOT NULL DEFAULT 'BROUILLARD';
ALTER TABLE "ecritures" ADD COLUMN "valideeAt" TIMESTAMP(3);
ALTER TABLE "ecritures" ADD COLUMN "valideeBy" TEXT;

-- Les écritures existantes sont VALIDÉES, pas mises en brouillard. Elles ont
-- été saisies sous un régime où toute écriture était définitive dès son
-- enregistrement : les basculer en brouillard les rendrait rétroactivement
-- modifiables et supprimables, ce qui reviendrait à rouvrir des documents
-- comptables déjà arrêtés. C'est exactement l'« altération » que l'article 20
-- de l'AUDCIF proscrit.
UPDATE "ecritures" SET "statut" = 'VALIDEE', "valideeAt" = "createdAt", "valideeBy" = "createdBy";

CREATE INDEX "ecritures_statut_idx" ON "ecritures"("tenantId", "statut");
