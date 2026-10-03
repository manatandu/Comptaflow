-- Ligne A11 (relevé CPCC C7, décision de Manasse du 2026-10-02) · l'écriture
-- de l'impôt sur le résultat PROPOSÉE à la clôture et passée au seul clic du
-- cabinet (AUDCIF Titre VII, compte 89 · « Débité de l'impôt exigible, par le
-- crédit du compte 441 »). Une ligne par constat, l'écriture RETENUE.

-- CreateTable
CREATE TABLE "constats_impot_resultat" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "montantImpot" DECIMAL(18,2) NOT NULL,
    "minimumApplique" BOOLEAN NOT NULL,
    "montantImpute" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "attestationRegime" TEXT,
    "ecritureId" TEXT,
    "annuleeLe" TIMESTAMP(3),
    "annuleePar" TEXT,
    "motifAnnulation" TEXT,
    "annulation" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "constats_impot_resultat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "constats_impot_resultat_ecritureId_key" ON "constats_impot_resultat"("ecritureId");

-- CreateIndex
CREATE INDEX "constats_impot_resultat_tenantId_idx" ON "constats_impot_resultat"("tenantId");

-- Un seul constat NON ANNULÉ par exercice · deux NULL tenus pour ÉGAUX, les
-- constats annulés, datés, s'y ajoutent sans le rompre (comme la
-- réévaluation des devises et la revue des créances douteuses).
CREATE UNIQUE INDEX "constats_impot_resultat_exerciceId_annuleeLe_key"
  ON "constats_impot_resultat"("exerciceId", "annuleeLe") NULLS NOT DISTINCT;

-- AddForeignKey
ALTER TABLE "constats_impot_resultat" ADD CONSTRAINT "constats_impot_resultat_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constats_impot_resultat" ADD CONSTRAINT "constats_impot_resultat_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "constats_impot_resultat" ADD CONSTRAINT "constats_impot_resultat_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
