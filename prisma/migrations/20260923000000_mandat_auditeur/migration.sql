-- Mandat du contrôleur des comptes · auditeur au SYCEBNL (art. 19 à 22),
-- commissaire aux comptes à l'AUSCGIE (art. 379, 703 à 705).
--
-- Le contrôle 6 réclamait déjà de « vérifier que le mandat est en cours »
-- alors qu'aucune table ne le détenait.

CREATE TYPE "OrganeDesignationAuditeur" AS ENUM (
  'STATUTS_OU_AG_CONSTITUTIVE',
  'ASSEMBLEE_GENERALE_ORDINAIRE',
  'ASSOCIES',
  'BAILLEUR_OU_ETAT',
  'JURIDICTION'
);

CREATE TABLE "mandats_auditeur" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "nom" TEXT NOT NULL,
  "inscriptionOrdre" TEXT NOT NULL,
  "organeDesignation" "OrganeDesignationAuditeur" NOT NULL,
  "dateDesignation" TIMESTAMP(3) NOT NULL,
  "premierExercice" INTEGER NOT NULL,
  "nombreExercices" INTEGER NOT NULL,
  "rang" INTEGER NOT NULL DEFAULT 1,
  "refusDeProrogation" BOOLEAN NOT NULL DEFAULT false,
  "finAnticipeeLe" TIMESTAMP(3),
  "motifFin" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "mandats_auditeur_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "mandats_auditeur_tenantId_premierExercice_idx"
  ON "mandats_auditeur"("tenantId", "premierExercice");

ALTER TABLE "mandats_auditeur"
  ADD CONSTRAINT "mandats_auditeur_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
