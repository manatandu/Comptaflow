-- Lot 13 · coûts d'emprunt incorporés au coût d'un actif qualifié.
-- AUDCIF Titre VIII ch. 7 ; fiches du compte 67 (AUDCIF Titre VII · SYCEBNL
-- Partie 2 ch. 3) et du compte 72 du SYCEBNL.

CREATE TYPE "NatureEmpruntIncorpore" AS ENUM ('SPECIFIQUE', 'GENERAL');

CREATE TABLE "couts_emprunt_incorpores" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "immobilisationId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "nature" "NatureEmpruntIncorpore" NOT NULL,
    "debutPreparation" DATE NOT NULL,
    "finPreparation" DATE NOT NULL,
    "justificationPeriodeCourte" TEXT,
    "dateDebut" DATE NOT NULL,
    "dateFin" DATE NOT NULL,
    "mois" INTEGER NOT NULL,
    "base" DECIMAL(18,2) NOT NULL,
    "tauxPourcent" DECIMAL(9,4) NOT NULL,
    "produitsPlacement" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "montant" DECIMAL(18,2) NOT NULL,
    "ecritureId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "couts_emprunt_incorpores_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "couts_emprunt_incorpores_ecritureId_key" ON "couts_emprunt_incorpores"("ecritureId");
CREATE INDEX "couts_emprunt_incorpores_tenantId_idx" ON "couts_emprunt_incorpores"("tenantId");
CREATE INDEX "couts_emprunt_incorpores_immobilisationId_idx" ON "couts_emprunt_incorpores"("immobilisationId");
CREATE INDEX "couts_emprunt_incorpores_exerciceId_idx" ON "couts_emprunt_incorpores"("exerciceId");

ALTER TABLE "couts_emprunt_incorpores" ADD CONSTRAINT "couts_emprunt_incorpores_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "couts_emprunt_incorpores" ADD CONSTRAINT "couts_emprunt_incorpores_immobilisationId_fkey" FOREIGN KEY ("immobilisationId") REFERENCES "immobilisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "couts_emprunt_incorpores" ADD CONSTRAINT "couts_emprunt_incorpores_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "couts_emprunt_incorpores" ADD CONSTRAINT "couts_emprunt_incorpores_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
