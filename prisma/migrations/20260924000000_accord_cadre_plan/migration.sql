-- Accord-cadre avec le Ministère du Plan et les trois autres conditions de
-- l'article 37 de la loi n° 004/2001 (ONG de droit étranger).
--
-- `exemption-is-ebnl.ts` écrivait depuis G4a que « OmegaX NE TIENT PAS
-- l'accord-cadre » · manque déclaré, refermé.

CREATE TABLE "accords_cadres_plan" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "reference" TEXT NOT NULL,
  "dateSignature" TIMESTAMP(3) NOT NULL,
  "dureeAnnees" INTEGER NOT NULL,
  "taciteReconduction" BOOLEAN NOT NULL DEFAULT false,
  "preavisMois" INTEGER,
  "denonceLe" TIMESTAMP(3),
  "motifDenonciation" TEXT,
  "representationRdc" TEXT,
  "attestationsBonneConduiteLe" TIMESTAMP(3),
  "partMainOeuvreLocale" DOUBLE PRECISION,
  "sourceMainOeuvre" TEXT,
  "dateMainOeuvre" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "accords_cadres_plan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "accords_cadres_plan_tenantId_dateSignature_idx"
  ON "accords_cadres_plan"("tenantId", "dateSignature");

ALTER TABLE "accords_cadres_plan"
  ADD CONSTRAINT "accords_cadres_plan_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
