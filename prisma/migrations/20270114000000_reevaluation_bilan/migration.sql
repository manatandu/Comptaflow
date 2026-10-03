-- Lot 14 · réévaluation légale ou libre des immobilisations corporelles et
-- financières. AUDCIF art. 35, 62 à 65 ; Titre VIII ch. 28, ch. 12 § 2.5,
-- ch. 16 § 2.6 ; SYCEBNL Partie 3 ch. 1 § 2.1.1.3 ; loi n° 23/053, art. 129
-- à 138.

CREATE TYPE "TypeReevaluation" AS ENUM ('LEGALE', 'LIBRE');
CREATE TYPE "MethodeReevaluationLibre" AS ENUM ('AJUSTEMENT', 'ELIMINATION');

-- Ce que la réévaluation a changé au cumul des amortissements d'un bien
-- (positif, méthode 1 et légale ; négatif, méthode 2).
ALTER TABLE "immobilisations" ADD COLUMN "amortissementsReevaluation" DECIMAL(18,2) NOT NULL DEFAULT 0;

-- La part d'une perte de valeur imputée sur l'écart de réévaluation (ch. 12 § 2.5).
ALTER TABLE "depreciations_immobilisation" ADD COLUMN "montantImputeEcart" DECIMAL(18,2) NOT NULL DEFAULT 0;

CREATE TABLE "reevaluations_bilan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "type" "TypeReevaluation" NOT NULL,
    "methodeLibre" "MethodeReevaluationLibre",
    "neutraliteFiscale" BOOLEAN NOT NULL DEFAULT false,
    "dateReevaluation" DATE NOT NULL,
    "decision" TEXT NOT NULL,
    "traitementFiscal" TEXT NOT NULL,
    "methodeEvaluation" TEXT NOT NULL,
    "categories" JSONB NOT NULL,
    "totalEcart" DECIMAL(18,2) NOT NULL,
    "ecritureId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "reevaluations_bilan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reevaluations_bilan_ecritureId_key" ON "reevaluations_bilan"("ecritureId");
CREATE UNIQUE INDEX "reevaluations_bilan_tenantId_exerciceId_key" ON "reevaluations_bilan"("tenantId", "exerciceId");

ALTER TABLE "reevaluations_bilan" ADD CONSTRAINT "reevaluations_bilan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reevaluations_bilan" ADD CONSTRAINT "reevaluations_bilan_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reevaluations_bilan" ADD CONSTRAINT "reevaluations_bilan_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "lignes_reevaluation_bilan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "reevaluationId" TEXT NOT NULL,
    "immobilisationId" TEXT NOT NULL,
    "categorie" TEXT,
    "coefficient" DECIMAL(12,6),
    "valeurActuelle" DECIMAL(18,2),
    "coefficientRetenu" DECIMAL(18,10) NOT NULL,
    "brutAvant" DECIMAL(18,2) NOT NULL,
    "amortissementsAvant" DECIMAL(18,2) NOT NULL,
    "valeurNetteAvant" DECIMAL(18,2) NOT NULL,
    "brutApres" DECIMAL(18,2) NOT NULL,
    "amortissementsApres" DECIMAL(18,2) NOT NULL,
    "valeurReevaluee" DECIMAL(18,2) NOT NULL,
    "ecart" DECIMAL(18,2) NOT NULL,
    "compteEcart" TEXT,
    "droitDeReprise" BOOLEAN,
    "motifNonReevalue" TEXT,
    "provisionReprise" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "ecartImpute" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "lignes_reevaluation_bilan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "lignes_reevaluation_bilan_reevaluationId_immobilisationId_key" ON "lignes_reevaluation_bilan"("reevaluationId", "immobilisationId");
CREATE INDEX "lignes_reevaluation_bilan_tenantId_immobilisationId_idx" ON "lignes_reevaluation_bilan"("tenantId", "immobilisationId");

ALTER TABLE "lignes_reevaluation_bilan" ADD CONSTRAINT "lignes_reevaluation_bilan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lignes_reevaluation_bilan" ADD CONSTRAINT "lignes_reevaluation_bilan_reevaluationId_fkey" FOREIGN KEY ("reevaluationId") REFERENCES "reevaluations_bilan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "lignes_reevaluation_bilan" ADD CONSTRAINT "lignes_reevaluation_bilan_immobilisationId_fkey" FOREIGN KEY ("immobilisationId") REFERENCES "immobilisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "reprises_provision_reevaluation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "detail" JSONB NOT NULL,
    "ecritureId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "reprises_provision_reevaluation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "reprises_provision_reevaluation_ecritureId_key" ON "reprises_provision_reevaluation"("ecritureId");
CREATE UNIQUE INDEX "reprises_provision_reevaluation_tenantId_exerciceId_key" ON "reprises_provision_reevaluation"("tenantId", "exerciceId");

ALTER TABLE "reprises_provision_reevaluation" ADD CONSTRAINT "reprises_provision_reevaluation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reprises_provision_reevaluation" ADD CONSTRAINT "reprises_provision_reevaluation_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "reprises_provision_reevaluation" ADD CONSTRAINT "reprises_provision_reevaluation_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
