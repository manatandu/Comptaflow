-- CreateEnum
CREATE TYPE "OrigineFaiblesse" AS ENUM ('REVISION_INTERNE', 'RECOMMANDATION_EXTERNE');

-- CreateEnum
CREATE TYPE "QualificationFaiblesse" AS ENUM ('SIGNIFICATIVE', 'AUTRE', 'NON_QUALIFIEE');

-- CreateEnum
CREATE TYPE "StatutFaiblesse" AS ENUM ('OUVERTE', 'EN_COURS_DE_REMEDIATION', 'REMEDIEE', 'NON_REMEDIEE_ASSUMEE', 'SANS_OBJET');

-- CreateEnum
CREATE TYPE "StatutRegistreFaiblesses" AS ENUM ('OUVERT', 'CLOS');

-- CreateTable
CREATE TABLE "registres_faiblesses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "origine" "OrigineFaiblesse" NOT NULL,
    "libelle" TEXT NOT NULL,
    "emetteur" TEXT,
    "dateLettre" TIMESTAMP(3),
    "referenceLettre" TEXT,
    "statut" "StatutRegistreFaiblesses" NOT NULL DEFAULT 'OUVERT',
    "closLe" TIMESTAMP(3),
    "closPar" TEXT,
    "motifCloture" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registres_faiblesses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "faiblesses_controle_interne" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "registreId" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "effetPotentiel" TEXT NOT NULL,
    "qualification" "QualificationFaiblesse" NOT NULL DEFAULT 'NON_QUALIFIEE',
    "qualifiePar" TEXT,
    "qualifieLe" TIMESTAMP(3),
    "justificationQualification" TEXT,
    "indicateursA7" TEXT[],
    "recommandation" TEXT,
    "communiqueeLe" TIMESTAMP(3),
    "communiqueeA" TEXT,
    "statut" "StatutFaiblesse" NOT NULL DEFAULT 'OUVERTE',
    "constatePar" TEXT,
    "constateLe" TIMESTAMP(3),
    "reponseDirection" TEXT,
    "reponseDirectionPar" TEXT,
    "reponseDirectionLe" TIMESTAMP(3),
    "echeanceRemediation" TIMESTAMP(3),
    "remedieeLe" TIMESTAMP(3),
    "verificationCabinet" TEXT,
    "faiblesseAnterieureId" TEXT,
    "motifNonRemediation" TEXT,
    "escaladeeLe" TIMESTAMP(3),
    "escaladeeMotif" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "faiblesses_controle_interne_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registres_faiblesses_tenantId_exerciceId_idx" ON "registres_faiblesses"("tenantId", "exerciceId");

-- CreateIndex
CREATE UNIQUE INDEX "faiblesses_controle_interne_faiblesseAnterieureId_key" ON "faiblesses_controle_interne"("faiblesseAnterieureId");

-- CreateIndex
CREATE INDEX "faiblesses_controle_interne_tenantId_registreId_idx" ON "faiblesses_controle_interne"("tenantId", "registreId");

-- CreateIndex
CREATE UNIQUE INDEX "faiblesses_controle_interne_registreId_reference_key" ON "faiblesses_controle_interne"("registreId", "reference");

-- AddForeignKey
ALTER TABLE "registres_faiblesses" ADD CONSTRAINT "registres_faiblesses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registres_faiblesses" ADD CONSTRAINT "registres_faiblesses_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faiblesses_controle_interne" ADD CONSTRAINT "faiblesses_controle_interne_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faiblesses_controle_interne" ADD CONSTRAINT "faiblesses_controle_interne_registreId_fkey" FOREIGN KEY ("registreId") REFERENCES "registres_faiblesses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "faiblesses_controle_interne" ADD CONSTRAINT "faiblesses_controle_interne_faiblesseAnterieureId_fkey" FOREIGN KEY ("faiblesseAnterieureId") REFERENCES "faiblesses_controle_interne"("id") ON DELETE SET NULL ON UPDATE CASCADE;
