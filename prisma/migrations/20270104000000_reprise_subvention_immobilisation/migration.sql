-- La reprise au 799 d'une subvention d'investissement en nature (fiche du
-- compte 14, AUDCIF et SYCEBNL) · une par bien et par exercice, écriture
-- retenue (RESTRICT).
CREATE TYPE "NatureRepriseSubvention" AS ENUM ('EXERCICE', 'SORTIE');

CREATE TABLE "reprises_subvention_immobilisation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "immobilisationId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "nature" "NatureRepriseSubvention" NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "ecritureId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "reprises_subvention_immobilisation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reprises_subvention_immobilisation_ecritureId_key" ON "reprises_subvention_immobilisation"("ecritureId");
CREATE INDEX "reprises_subvention_immobilisation_tenantId_idx" ON "reprises_subvention_immobilisation"("tenantId");
CREATE INDEX "reprises_subvention_immobilisation_exerciceId_idx" ON "reprises_subvention_immobilisation"("exerciceId");
CREATE UNIQUE INDEX "reprises_subvention_immobilisation_immobilisationId_exercic_key" ON "reprises_subvention_immobilisation"("immobilisationId", "exerciceId");

ALTER TABLE "reprises_subvention_immobilisation" ADD CONSTRAINT "reprises_subvention_immobilisation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reprises_subvention_immobilisation" ADD CONSTRAINT "reprises_subvention_immobilisation_immobilisationId_fkey" FOREIGN KEY ("immobilisationId") REFERENCES "immobilisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reprises_subvention_immobilisation" ADD CONSTRAINT "reprises_subvention_immobilisation_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reprises_subvention_immobilisation" ADD CONSTRAINT "reprises_subvention_immobilisation_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
