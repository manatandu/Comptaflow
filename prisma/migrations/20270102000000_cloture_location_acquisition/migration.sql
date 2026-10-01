-- La clôture d'un contrat de location-acquisition par exercice · AUDCIF
-- Titre VIII ch. 8 § 2.1.8.2, fiche du compte 17. Une par contrat et par
-- exercice ; écritures retenues (RESTRICT).
CREATE TABLE "clotures_location_acquisition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "contratId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "loyers" DECIMAL(18,2) NOT NULL,
    "capital" DECIMAL(18,2) NOT NULL,
    "interets" DECIMAL(18,2) NOT NULL,
    "interetsCourus" DECIMAL(18,2) NOT NULL,
    "ecritureId" TEXT NOT NULL,
    "ecritureExtourneId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "clotures_location_acquisition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "clotures_location_acquisition_ecritureId_key" ON "clotures_location_acquisition"("ecritureId");
CREATE UNIQUE INDEX "clotures_location_acquisition_ecritureExtourneId_key" ON "clotures_location_acquisition"("ecritureExtourneId");
CREATE INDEX "clotures_location_acquisition_tenantId_idx" ON "clotures_location_acquisition"("tenantId");
CREATE INDEX "clotures_location_acquisition_exerciceId_idx" ON "clotures_location_acquisition"("exerciceId");
CREATE UNIQUE INDEX "clotures_location_acquisition_contratId_exerciceId_key" ON "clotures_location_acquisition"("contratId", "exerciceId");

ALTER TABLE "clotures_location_acquisition" ADD CONSTRAINT "clotures_location_acquisition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clotures_location_acquisition" ADD CONSTRAINT "clotures_location_acquisition_contratId_fkey" FOREIGN KEY ("contratId") REFERENCES "contrats_location_acquisition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clotures_location_acquisition" ADD CONSTRAINT "clotures_location_acquisition_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clotures_location_acquisition" ADD CONSTRAINT "clotures_location_acquisition_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "clotures_location_acquisition" ADD CONSTRAINT "clotures_location_acquisition_ecritureExtourneId_fkey" FOREIGN KEY ("ecritureExtourneId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
