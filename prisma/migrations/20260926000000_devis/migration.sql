-- DEVIS ET COMMANDE CLIENT · l'offre et son acceptation au sens de l'AUDCG.
--
-- Livre 8, art. 234 à 249 · le périmètre (marchandises entre commerçants), la
-- précision qui fait d'une proposition une offre (art. 241), les deux dates du
-- délai (art. 242 et 246), et l'art. 245 qui ne laisse à une réponse que deux
-- sens : acceptation, ou rejet valant contre-proposition.
--
-- Aucune donnée existante n'est touchée : deux tables neuves et trois enums.
-- Pas de table « commande client » · une commande est une RÉPONSE, et une
-- contre-proposition est un devis de sens inverse, chaîné au précédent.

-- CreateEnum
CREATE TYPE "EmetteurOffre" AS ENUM ('DOSSIER', 'CLIENT');

-- CreateEnum
CREATE TYPE "NatureOperationVente" AS ENUM ('MARCHANDISES', 'SERVICES', 'MIXTE_SERVICES_PREPONDERANTS', 'USAGE_PERSONNEL', 'REGIME_PARTICULIER');

-- CreateEnum
CREATE TYPE "NatureReponseDevis" AS ENUM ('ACCEPTATION', 'REFUS', 'MODIFICATION_NON_SUBSTANTIELLE', 'MODIFICATION_SUBSTANTIELLE');

-- CreateTable
CREATE TABLE "devis" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "emetteur" "EmetteurOffre" NOT NULL DEFAULT 'DOSSIER',
    "numero" TEXT NOT NULL,
    "dateEmission" TIMESTAMP(3) NOT NULL,
    "dateReception" TIMESTAMP(3),
    "delaiJours" INTEGER,
    "declareeIrrevocable" BOOLEAN NOT NULL DEFAULT false,
    "destinataireDetermine" BOOLEAN NOT NULL DEFAULT true,
    "volonteDEtreLie" BOOLEAN NOT NULL DEFAULT true,
    "nature" "NatureOperationVente" NOT NULL,
    "tiersId" TEXT,
    "clientNom" TEXT NOT NULL,
    "objet" TEXT,
    "natureReponse" "NatureReponseDevis",
    "dateReponse" TIMESTAMP(3),
    "detailReponse" TEXT,
    "revoqueLe" TIMESTAMP(3),
    "motifRevocation" TEXT,
    "contrePropositionDeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "devis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_devis" (
    "id" TEXT NOT NULL,
    "devisId" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,
    "designation" TEXT NOT NULL,
    "quantite" DECIMAL(18,4) NOT NULL,
    "prixUnitaire" DECIMAL(18,2) NOT NULL,
    "montantHT" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "lignes_devis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devis_contrePropositionDeId_key" ON "devis"("contrePropositionDeId");

-- CreateIndex
CREATE INDEX "devis_tenantId_dateEmission_idx" ON "devis"("tenantId", "dateEmission");

-- CreateIndex
CREATE UNIQUE INDEX "devis_tenantId_numero_key" ON "devis"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "lignes_devis_devisId_ordre_key" ON "lignes_devis"("devisId", "ordre");

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_tiersId_fkey" FOREIGN KEY ("tiersId") REFERENCES "tiers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devis" ADD CONSTRAINT "devis_contrePropositionDeId_fkey" FOREIGN KEY ("contrePropositionDeId") REFERENCES "devis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_devis" ADD CONSTRAINT "lignes_devis_devisId_fkey" FOREIGN KEY ("devisId") REFERENCES "devis"("id") ON DELETE CASCADE ON UPDATE CASCADE;
