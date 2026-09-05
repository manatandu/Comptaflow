-- REGISTRE DES PROVISIONS POUR RISQUES ET CHARGES · AUDCIF Titre VIII, ch. 18,
-- auquel le SYCEBNL renvoie expressément depuis son COMPTE 19. Une ligne = une
-- obligation, avec ses quatre conditions, son tableau de variation (§ 5.3) et
-- son statut · comptabilisée, passif éventuel, ou écartée.

CREATE TYPE "NatureProvision" AS ENUM ('LITIGE', 'GARANTIE_CLIENTS', 'PERTES_MARCHES_ACHEVEMENT_FUTUR', 'CHARGES_DONATIONS_LEGS', 'PERTES_DE_CHANGE', 'IMPOTS', 'PENSIONS_ET_OBLIGATIONS_SIMILAIRES', 'RESTRUCTURATION', 'AMENDES_ET_PENALITES', 'DEMANTELEMENT_ET_REMISE_EN_ETAT', 'PROPRE_ASSUREUR', 'DROITS_A_REDUCTION', 'CONTRAT_DEFICITAIRE', 'DEMENAGEMENT', 'DIVERS_RISQUES_ET_CHARGES', 'PERTES_OPERATIONNELLES_FUTURES', 'GROSSES_REPARATIONS');
CREATE TYPE "StatutProvision" AS ENUM ('EN_EXAMEN', 'COMPTABILISEE', 'PASSIF_EVENTUEL', 'ECARTEE', 'SOLDEE');

CREATE TABLE "provisions_risques_charges" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "objet" TEXT NOT NULL,
    "nature" "NatureProvision" NOT NULL,
    "compteId" TEXT,
    "statut" "StatutProvision" NOT NULL DEFAULT 'EN_EXAMEN',
    "obligationExiste" BOOLEAN NOT NULL DEFAULT false,
    "resulteEvenementPasse" BOOLEAN NOT NULL DEFAULT false,
    "sortieProbable" BOOLEAN NOT NULL DEFAULT false,
    "estimationFiable" BOOLEAN NOT NULL DEFAULT false,
    "justificationObligation" TEXT NOT NULL,
    "echeanceAttendue" TIMESTAMP(3),
    "incertitudes" TEXT,
    "montantOuverture" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "dotationsExercice" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "montantsUtilises" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "reprisesNonUtilisees" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "effetActualisation" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "remboursementAttendu" DECIMAL(18,2),
    "remboursementCertain" BOOLEAN NOT NULL DEFAULT false,
    "remboursementTiers" TEXT,
    "motifNonComptabilisation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "provisions_risques_charges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "provisions_risques_charges_tenantId_exerciceId_idx" ON "provisions_risques_charges"("tenantId", "exerciceId");

ALTER TABLE "provisions_risques_charges" ADD CONSTRAINT "provisions_risques_charges_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provisions_risques_charges" ADD CONSTRAINT "provisions_risques_charges_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "provisions_risques_charges" ADD CONSTRAINT "provisions_risques_charges_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
