-- Lot 11 · révision du plan d'amortissement (prospective, ou rétroactive avec
-- reprise au 798) et mode dégressif de la loi n° 23/053 au SYCEBNL.
-- Fiches des comptes 28 et 79 ; cadre conceptuel § 3.3.1.2 (décisions D-24 à
-- D-26).

ALTER TYPE "ModeAmortissement" ADD VALUE 'DEGRESSIF';

CREATE TYPE "NatureRevisionPlan" AS ENUM ('PROSPECTIVE', 'RETROACTIVE');

ALTER TABLE "immobilisations"
  ADD COLUMN "dateEffetRevisionPlan" TIMESTAMP(3),
  ADD COLUMN "dureeResiduelleRevisee" INTEGER,
  ADD COLUMN "reprisesAmortissement" DECIMAL(18,2) NOT NULL DEFAULT 0;

CREATE TABLE "revisions_plans_amortissement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "immobilisationId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "nature" "NatureRevisionPlan" NOT NULL,
    "dateDecision" TIMESTAMP(3) NOT NULL,
    "dureeAvantAns" INTEGER NOT NULL,
    "dureeApresAns" INTEGER NOT NULL,
    "motif" TEXT NOT NULL,
    "montantReprise" DECIMAL(18,2),
    "ecritureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "revisions_plans_amortissement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "revisions_plans_amortissement_ecritureId_key" ON "revisions_plans_amortissement"("ecritureId");
CREATE INDEX "revisions_plans_amortissement_tenantId_idx" ON "revisions_plans_amortissement"("tenantId");
CREATE INDEX "revisions_plans_amortissement_immobilisationId_idx" ON "revisions_plans_amortissement"("immobilisationId");
CREATE INDEX "revisions_plans_amortissement_exerciceId_idx" ON "revisions_plans_amortissement"("exerciceId");

ALTER TABLE "revisions_plans_amortissement" ADD CONSTRAINT "revisions_plans_amortissement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "revisions_plans_amortissement" ADD CONSTRAINT "revisions_plans_amortissement_immobilisationId_fkey" FOREIGN KEY ("immobilisationId") REFERENCES "immobilisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "revisions_plans_amortissement" ADD CONSTRAINT "revisions_plans_amortissement_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "revisions_plans_amortissement" ADD CONSTRAINT "revisions_plans_amortissement_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
