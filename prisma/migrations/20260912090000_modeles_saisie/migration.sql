-- MODÈLES DE SAISIE · les « opérations courantes » d'un journal, façon Sage.
--
-- Squelettes d'écriture nommés, créés par le comptable et non écrits dans le
-- code : comptes et libellés posés, montants laissés à la saisie. Distincts
-- des modèles d'abonnement, qui sont des contrats périodiques à deux comptes
-- avec un échéancier.

CREATE TYPE "SensModeleSaisie" AS ENUM ('DEBIT', 'CREDIT');

CREATE TABLE "modeles_saisie" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    -- NULL = modèle disponible dans tous les journaux du dossier.
    "journalId" TEXT,
    "estActif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "modeles_saisie_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "lignes_modele_saisie" (
    "id" TEXT NOT NULL,
    "modeleId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "compteId" TEXT NOT NULL,
    "sens" "SensModeleSaisie" NOT NULL,
    "libelle" TEXT,
    "montant" DECIMAL(18,2),

    CONSTRAINT "lignes_modele_saisie_pkey" PRIMARY KEY ("id")
);

-- Le nom est ce que le comptable choisit dans la liste déroulante · deux
-- modèles homonymes la rendraient indéchiffrable.
CREATE UNIQUE INDEX "modeles_saisie_tenantId_intitule_key" ON "modeles_saisie"("tenantId", "intitule");
CREATE INDEX "modeles_saisie_tenantId_journalId_idx" ON "modeles_saisie"("tenantId", "journalId");
CREATE UNIQUE INDEX "lignes_modele_saisie_modeleId_ordre_key" ON "lignes_modele_saisie"("modeleId", "ordre");
CREATE INDEX "lignes_modele_saisie_modeleId_idx" ON "lignes_modele_saisie"("modeleId");

ALTER TABLE "modeles_saisie" ADD CONSTRAINT "modeles_saisie_tenantId_fkey"
    FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "modeles_saisie" ADD CONSTRAINT "modeles_saisie_journalId_fkey"
    FOREIGN KEY ("journalId") REFERENCES "journaux"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Supprimer un modèle emporte ses lignes · elles n'ont aucun sens seules,
-- et ce ne sont pas des écritures comptables mais un gabarit.
ALTER TABLE "lignes_modele_saisie" ADD CONSTRAINT "lignes_modele_saisie_modeleId_fkey"
    FOREIGN KEY ("modeleId") REFERENCES "modeles_saisie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lignes_modele_saisie" ADD CONSTRAINT "lignes_modele_saisie_compteId_fkey"
    FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
