-- CIRCULARISATION · l'inventaire DOCUMENTAIRE du CPCC, conduit selon la
-- méthode de l'ISA 505 (demandes positives ou négatives, non-réponses,
-- exceptions). Le module ne rend aucune opinion d'audit : un cabinet qui tient
-- les livres n'est pas l'auditeur de ces livres.

CREATE TYPE "CycleCircularisation" AS ENUM ('BANQUES', 'FOURNISSEURS', 'CLIENTS_ADHERENTS', 'AUTRES_TIERS', 'AUTRES');
CREATE TYPE "FormeConfirmation" AS ENUM ('POSITIVE', 'NEGATIVE');
CREATE TYPE "StatutCampagneCircularisation" AS ENUM ('PREPARATION', 'ENVOYEE', 'RELANCEE', 'DEPOUILLEE', 'CLOTUREE');
CREATE TYPE "StatutDemandeConfirmation" AS ENUM ('A_ENVOYER', 'ENVOYEE', 'RELANCEE', 'REPONSE_RECUE', 'SANS_REPONSE', 'NON_DISTRIBUEE');
CREATE TYPE "NatureEcartConfirmation" AS ENUM ('DELAI', 'MESURE', 'ERREUR_MATERIELLE', 'ANOMALIE_POTENTIELLE');

CREATE TABLE "campagnes_circularisation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "dateArrete" TIMESTAMP(3) NOT NULL,
    "cycle" "CycleCircularisation" NOT NULL,
    "forme" "FormeConfirmation" NOT NULL DEFAULT 'POSITIVE',
    "methodeSelection" TEXT,
    "conditionsNegativeReunies" TEXT[],
    "refusDirectionMotif" TEXT,
    "statut" "StatutCampagneCircularisation" NOT NULL DEFAULT 'PREPARATION',
    "envoyeeLe" TIMESTAMP(3),
    "relanceeLe" TIMESTAMP(3),
    "clotureeLe" TIMESTAMP(3),
    "clotureePar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "campagnes_circularisation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "demandes_confirmation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campagneId" TEXT NOT NULL,
    "tiersId" TEXT,
    "compteId" TEXT NOT NULL,
    "destinataire" TEXT NOT NULL,
    "adresse" TEXT,
    "soldeAConfirmer" DECIMAL(18,2) NOT NULL,
    "statut" "StatutDemandeConfirmation" NOT NULL DEFAULT 'A_ENVOYER',
    "envoyeeLe" TIMESTAMP(3),
    "relanceeLe" TIMESTAMP(3),
    "recueLe" TIMESTAMP(3),
    "soldeConfirme" DECIMAL(18,2),
    "ecart" DECIMAL(18,2),
    "natureEcart" "NatureEcartConfirmation",
    "investigation" TEXT,
    "proceduresAlternatives" TEXT,
    "reponseIndirecte" BOOLEAN NOT NULL DEFAULT false,
    "doutefiabilite" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "demandes_confirmation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "campagnes_circularisation_tenantId_exerciceId_idx" ON "campagnes_circularisation"("tenantId", "exerciceId");
CREATE INDEX "demandes_confirmation_tenantId_campagneId_idx" ON "demandes_confirmation"("tenantId", "campagneId");
CREATE INDEX "demandes_confirmation_tenantId_compteId_idx" ON "demandes_confirmation"("tenantId", "compteId");

ALTER TABLE "campagnes_circularisation" ADD CONSTRAINT "campagnes_circularisation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "campagnes_circularisation" ADD CONSTRAINT "campagnes_circularisation_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demandes_confirmation" ADD CONSTRAINT "demandes_confirmation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "demandes_confirmation" ADD CONSTRAINT "demandes_confirmation_campagneId_fkey" FOREIGN KEY ("campagneId") REFERENCES "campagnes_circularisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "demandes_confirmation" ADD CONSTRAINT "demandes_confirmation_tiersId_fkey" FOREIGN KEY ("tiersId") REFERENCES "tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "demandes_confirmation" ADD CONSTRAINT "demandes_confirmation_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
