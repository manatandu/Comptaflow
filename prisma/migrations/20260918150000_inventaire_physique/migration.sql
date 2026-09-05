-- INVENTAIRE PHYSIQUE · AUDCIF art. 42 (recensement et évaluation à la valeur
-- actuelle, non écarté par l'art. 3 du SYCEBNL), sanction AUDCIF art. 111 côté
-- SYSCOHADA et SYCEBNL art. 24 premier tiret côté entités à but non lucratif.

CREATE TYPE "StatutCampagneInventaire" AS ENUM ('PREPARATION', 'RECENSEMENT', 'ARBITRAGE', 'CLOTUREE');
CREATE TYPE "RoleMembreInventaire" AS ENUM ('INVENTORIANT', 'TEMOIN');
CREATE TYPE "DecisionEcartInventaire" AS ENUM ('A_REDRESSER', 'EXPLIQUE', 'EXCEDENT_NON_COMPTABILISE', 'RENVOYE_COMMISSION_PRINCIPALE');

CREATE TABLE "campagnes_inventaire" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "dateInventaire" TIMESTAMP(3) NOT NULL,
    "libelle" TEXT NOT NULL,
    "instructions" TEXT,
    "statut" "StatutCampagneInventaire" NOT NULL DEFAULT 'PREPARATION',
    "procesVerbalEtabliLe" TIMESTAMP(3),
    "procesVerbalPar" TEXT,
    "clotureeLe" TIMESTAMP(3),
    "clotureePar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campagnes_inventaire_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sous_commissions_inventaire" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campagneId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "perimetre" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sous_commissions_inventaire_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membres_sous_commission_inventaire" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sousCommissionId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "fonction" TEXT,
    "role" "RoleMembreInventaire" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "membres_sous_commission_inventaire_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "fiches_inventaire" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campagneId" TEXT NOT NULL,
    "sousCommissionId" TEXT,
    "compteId" TEXT NOT NULL,
    "immobilisationId" TEXT,
    "designation" TEXT NOT NULL,
    "emplacement" TEXT,
    "uniteMesure" TEXT,
    "quantiteComptee" DECIMAL(18,3),
    "valeurInventaire" DECIMAL(18,2),
    "referencePiece" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fiches_inventaire_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "campagnes_inventaire_tenantId_exerciceId_idx" ON "campagnes_inventaire"("tenantId", "exerciceId");
CREATE INDEX "sous_commissions_inventaire_tenantId_campagneId_idx" ON "sous_commissions_inventaire"("tenantId", "campagneId");
CREATE INDEX "membres_sous_commission_inventaire_tenantId_sousCommissionI_idx" ON "membres_sous_commission_inventaire"("tenantId", "sousCommissionId");
CREATE INDEX "fiches_inventaire_tenantId_campagneId_idx" ON "fiches_inventaire"("tenantId", "campagneId");
CREATE INDEX "fiches_inventaire_tenantId_compteId_idx" ON "fiches_inventaire"("tenantId", "compteId");

ALTER TABLE "campagnes_inventaire" ADD CONSTRAINT "campagnes_inventaire_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campagnes_inventaire" ADD CONSTRAINT "campagnes_inventaire_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sous_commissions_inventaire" ADD CONSTRAINT "sous_commissions_inventaire_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "sous_commissions_inventaire" ADD CONSTRAINT "sous_commissions_inventaire_campagneId_fkey" FOREIGN KEY ("campagneId") REFERENCES "campagnes_inventaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "membres_sous_commission_inventaire" ADD CONSTRAINT "membres_sous_commission_inventaire_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "membres_sous_commission_inventaire" ADD CONSTRAINT "membres_sous_commission_inventaire_sousCommissionId_fkey" FOREIGN KEY ("sousCommissionId") REFERENCES "sous_commissions_inventaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiches_inventaire" ADD CONSTRAINT "fiches_inventaire_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiches_inventaire" ADD CONSTRAINT "fiches_inventaire_campagneId_fkey" FOREIGN KEY ("campagneId") REFERENCES "campagnes_inventaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fiches_inventaire" ADD CONSTRAINT "fiches_inventaire_sousCommissionId_fkey" FOREIGN KEY ("sousCommissionId") REFERENCES "sous_commissions_inventaire"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "fiches_inventaire" ADD CONSTRAINT "fiches_inventaire_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "fiches_inventaire" ADD CONSTRAINT "fiches_inventaire_immobilisationId_fkey" FOREIGN KEY ("immobilisationId") REFERENCES "immobilisations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "ecarts_inventaire" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campagneId" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "valeurInventaire" DECIMAL(18,2) NOT NULL,
    "soldeComptable" DECIMAL(18,2) NOT NULL,
    "ecart" DECIMAL(18,2) NOT NULL,
    "nombreFiches" INTEGER NOT NULL,
    "rapprocheLe" TIMESTAMP(3) NOT NULL,
    "decision" "DecisionEcartInventaire",
    "responsable" TEXT,
    "explication" TEXT,
    "arbitreLe" TIMESTAMP(3),
    "arbitrePar" TEXT,
    "ecritureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ecarts_inventaire_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ecarts_inventaire_campagneId_compteId_key" ON "ecarts_inventaire"("campagneId", "compteId");
CREATE INDEX "ecarts_inventaire_tenantId_campagneId_idx" ON "ecarts_inventaire"("tenantId", "campagneId");

ALTER TABLE "ecarts_inventaire" ADD CONSTRAINT "ecarts_inventaire_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ecarts_inventaire" ADD CONSTRAINT "ecarts_inventaire_campagneId_fkey" FOREIGN KEY ("campagneId") REFERENCES "campagnes_inventaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ecarts_inventaire" ADD CONSTRAINT "ecarts_inventaire_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ecarts_inventaire" ADD CONSTRAINT "ecarts_inventaire_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
