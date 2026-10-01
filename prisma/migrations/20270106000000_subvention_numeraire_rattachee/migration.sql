-- Lot 5 · la subvention d'investissement reçue en numéraire, rattachée au
-- bien qu'elle finance (AUDCIF Titre VIII ch. 17 § 3.2, § 4.3.1, § 4.4, § 4.6,
-- § 4.7 ; SYCEBNL Partie 3 ch. 1 § 2.5). Méthode de dépréciation du § 4.6
-- déclarée par dossier, sans défaut (décision D-11).
CREATE TYPE "MethodeDepreciationBienSubventionne" AS ENUM ('VNC_MINOREE_DES_SUBVENTIONS', 'VNC_ENTIERE');
CREATE TYPE "NatureReductionSubvention" AS ENUM ('REMBOURSEMENT', 'NON_VERSEE');

ALTER TABLE "tenants" ADD COLUMN "methodeDepreciationBienSubventionne" "MethodeDepreciationBienSubventionne";

CREATE TABLE "subventions_immobilisations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "immobilisationId" TEXT NOT NULL,
    "compteSubventionId" TEXT NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "dateOctroi" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "dureeInalienabiliteAns" INTEGER,
    "motifSansVentilation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "subventions_immobilisations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "reductions_subventions_immobilisations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "subventionId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "nature" "NatureReductionSubvention" NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "motif" TEXT NOT NULL,
    "compteContrepartieId" TEXT NOT NULL,
    "ecritureId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "reductions_subventions_immobilisations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "subventions_immobilisations_tenantId_idx" ON "subventions_immobilisations"("tenantId");
CREATE INDEX "subventions_immobilisations_compteSubventionId_idx" ON "subventions_immobilisations"("compteSubventionId");
CREATE UNIQUE INDEX "subventions_immobilisations_immobilisationId_compteSubventi_key" ON "subventions_immobilisations"("immobilisationId", "compteSubventionId");

CREATE UNIQUE INDEX "reductions_subventions_immobilisations_ecritureId_key" ON "reductions_subventions_immobilisations"("ecritureId");
CREATE INDEX "reductions_subventions_immobilisations_tenantId_idx" ON "reductions_subventions_immobilisations"("tenantId");
CREATE INDEX "reductions_subventions_immobilisations_subventionId_idx" ON "reductions_subventions_immobilisations"("subventionId");
CREATE INDEX "reductions_subventions_immobilisations_exerciceId_idx" ON "reductions_subventions_immobilisations"("exerciceId");

ALTER TABLE "subventions_immobilisations" ADD CONSTRAINT "subventions_immobilisations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subventions_immobilisations" ADD CONSTRAINT "subventions_immobilisations_immobilisationId_fkey" FOREIGN KEY ("immobilisationId") REFERENCES "immobilisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "subventions_immobilisations" ADD CONSTRAINT "subventions_immobilisations_compteSubventionId_fkey" FOREIGN KEY ("compteSubventionId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reductions_subventions_immobilisations" ADD CONSTRAINT "reductions_subventions_immobilisations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reductions_subventions_immobilisations" ADD CONSTRAINT "reductions_subventions_immobilisations_subventionId_fkey" FOREIGN KEY ("subventionId") REFERENCES "subventions_immobilisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reductions_subventions_immobilisations" ADD CONSTRAINT "reductions_subventions_immobilisations_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reductions_subventions_immobilisations" ADD CONSTRAINT "reductions_subventions_immobilisations_compteContrepartieI_fkey" FOREIGN KEY ("compteContrepartieId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reductions_subventions_immobilisations" ADD CONSTRAINT "reductions_subventions_immobilisations_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
