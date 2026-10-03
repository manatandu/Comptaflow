-- LIGNE A7 · créances douteuses ou litigieuses, dépréciation dossier par
-- dossier (relevé CPCC C3, décision de Manasse du 2026-10-02).
--
-- AUDCIF Titre VII et SYCEBNL, fiches des comptes 41 et 49 · reclassement au
-- 416, dépréciation au 491 à la clôture (D 659), reprise au 759, perte au 651.
-- Une ligne par créance, motif et pièces gardés · la fiche du compte 49 exige
-- un élément « individualisé » et des motifs justifiés.

CREATE TYPE "NatureCreanceDouteuse" AS ENUM ('LITIGIEUSE', 'DOUTEUSE');
CREATE TYPE "TypeMouvementCreanceDouteuse" AS ENUM ('PERTE', 'RECOUVREMENT');

CREATE TABLE "creances_douteuses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "nature" "NatureCreanceDouteuse" NOT NULL,
    "compteCreanceId" TEXT NOT NULL,
    "compte416Id" TEXT NOT NULL,
    "compte491Id" TEXT NOT NULL,
    "dateReclassement" DATE NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "motif" TEXT NOT NULL,
    "pieces" JSONB NOT NULL,
    "ecritureReclassementId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "creances_douteuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "creances_douteuses_ecritureReclassementId_key" ON "creances_douteuses"("ecritureReclassementId");
CREATE INDEX "creances_douteuses_tenantId_idx" ON "creances_douteuses"("tenantId");
CREATE INDEX "creances_douteuses_exerciceId_idx" ON "creances_douteuses"("exerciceId");

ALTER TABLE "creances_douteuses" ADD CONSTRAINT "creances_douteuses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creances_douteuses" ADD CONSTRAINT "creances_douteuses_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creances_douteuses" ADD CONSTRAINT "creances_douteuses_compteCreanceId_fkey" FOREIGN KEY ("compteCreanceId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creances_douteuses" ADD CONSTRAINT "creances_douteuses_compte416Id_fkey" FOREIGN KEY ("compte416Id") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creances_douteuses" ADD CONSTRAINT "creances_douteuses_compte491Id_fkey" FOREIGN KEY ("compte491Id") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "creances_douteuses" ADD CONSTRAINT "creances_douteuses_ecritureReclassementId_fkey" FOREIGN KEY ("ecritureReclassementId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "ajustements_creances_douteuses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "creanceId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "depreciationNecessaire" DECIMAL(18,2) NOT NULL,
    "depreciationEnPlace" DECIMAL(18,2) NOT NULL,
    "ecart" DECIMAL(18,2) NOT NULL,
    "motif" TEXT NOT NULL,
    "pieces" JSONB NOT NULL,
    "ecritureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "ajustements_creances_douteuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ajustements_creances_douteuses_ecritureId_key" ON "ajustements_creances_douteuses"("ecritureId");
CREATE UNIQUE INDEX "ajustements_creances_douteuses_creanceId_exerciceId_key" ON "ajustements_creances_douteuses"("creanceId", "exerciceId");
CREATE INDEX "ajustements_creances_douteuses_tenantId_idx" ON "ajustements_creances_douteuses"("tenantId");
CREATE INDEX "ajustements_creances_douteuses_exerciceId_idx" ON "ajustements_creances_douteuses"("exerciceId");

ALTER TABLE "ajustements_creances_douteuses" ADD CONSTRAINT "ajustements_creances_douteuses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ajustements_creances_douteuses" ADD CONSTRAINT "ajustements_creances_douteuses_creanceId_fkey" FOREIGN KEY ("creanceId") REFERENCES "creances_douteuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ajustements_creances_douteuses" ADD CONSTRAINT "ajustements_creances_douteuses_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ajustements_creances_douteuses" ADD CONSTRAINT "ajustements_creances_douteuses_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "mouvements_creances_douteuses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "creanceId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "type" "TypeMouvementCreanceDouteuse" NOT NULL,
    "date" DATE NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "motif" TEXT NOT NULL,
    "pieces" JSONB NOT NULL,
    "ecritureId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "mouvements_creances_douteuses_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mouvements_creances_douteuses_ecritureId_key" ON "mouvements_creances_douteuses"("ecritureId");
CREATE INDEX "mouvements_creances_douteuses_tenantId_idx" ON "mouvements_creances_douteuses"("tenantId");
CREATE INDEX "mouvements_creances_douteuses_creanceId_idx" ON "mouvements_creances_douteuses"("creanceId");
CREATE INDEX "mouvements_creances_douteuses_exerciceId_idx" ON "mouvements_creances_douteuses"("exerciceId");

ALTER TABLE "mouvements_creances_douteuses" ADD CONSTRAINT "mouvements_creances_douteuses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mouvements_creances_douteuses" ADD CONSTRAINT "mouvements_creances_douteuses_creanceId_fkey" FOREIGN KEY ("creanceId") REFERENCES "creances_douteuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mouvements_creances_douteuses" ADD CONSTRAINT "mouvements_creances_douteuses_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mouvements_creances_douteuses" ADD CONSTRAINT "mouvements_creances_douteuses_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
