-- Registre des exonérations douanières et fiscales.
--
-- Article 39 de la loi n° 004/2001 : l'État accorde aux ONG l'exonération des
-- droits sur l'importation des biens liés à leur mission, constatée par arrêté
-- interministériel des Ministres du Plan et des Finances. Le code des douanes
-- (O.-L. n° 10/002, art. 338) pose qu'aucune franchise ne se présume : sans
-- l'arrêté, les droits sont dus et la marchandise reste au port.
--
-- Le logiciel ne calcule aucun droit et n'accorde aucune exonération. Il tient
-- le registre des arrêtés, les pièces exigées par la note circulaire
-- n° 003/2013 du Ministère du Plan, et la date de renouvellement · un arrêté
-- prévisionnel périmé se découvre d'ordinaire au port.
CREATE TYPE "TypeDemandeExoneration" AS ENUM ('PONCTUEL', 'PREVISIONNEL', 'RENOUVELLEMENT');
CREATE TYPE "StatutExoneration" AS ENUM ('EN_PREPARATION', 'DEPOSE', 'ACCORDE', 'REJETE', 'EXPIRE');

CREATE TABLE "exonerations" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "type" "TypeDemandeExoneration" NOT NULL,
  "statut" "StatutExoneration" NOT NULL DEFAULT 'EN_PREPARATION',
  "objet" TEXT NOT NULL,
  "referenceArrete" TEXT,
  "dateArrete" TIMESTAMP(3),
  "dateDebutValidite" TIMESTAMP(3),
  "dateFinValidite" TIMESTAMP(3),
  "lettreTransport" TEXT,
  "valeurBiens" DECIMAL(18,2),
  "franchiseDouaniere" TEXT,
  "piecesFournies" TEXT[],
  "observations" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy" TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "exonerations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "exonerations_tenantId_statut_idx" ON "exonerations"("tenantId", "statut");
CREATE INDEX "exonerations_tenantId_dateFinValidite_idx" ON "exonerations"("tenantId", "dateFinValidite");

ALTER TABLE "exonerations"
  ADD CONSTRAINT "exonerations_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
