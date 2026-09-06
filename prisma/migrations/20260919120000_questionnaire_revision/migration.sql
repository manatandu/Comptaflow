-- CreateEnum
CREATE TYPE "CycleQuestionnaire" AS ENUM ('IMMOBILISATIONS', 'STOCKS', 'CAISSES', 'BANQUES', 'DETTES_FOURNISSEURS', 'PROVISIONS', 'CREANCES', 'VENTES_CLIENTS', 'ACHATS', 'PAIE_ET_CHARGES_SOCIALES', 'ETAT_ET_COLLECTIVITES', 'CAPITAUX_PROPRES', 'REGULARISATIONS', 'ENGAGEMENTS_HORS_BILAN');

-- CreateEnum
CREATE TYPE "ReponseItem" AS ENUM ('OUI', 'NON', 'SANS_OBJET');

-- CreateEnum
CREATE TYPE "StatutQuestionnaire" AS ENUM ('OUVERT', 'CLOS');

-- CreateTable
CREATE TABLE "questionnaires_revision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "cycles" "CycleQuestionnaire"[],
    "statut" "StatutQuestionnaire" NOT NULL DEFAULT 'OUVERT',
    "closLe" TIMESTAMP(3),
    "closPar" TEXT,
    "motifCloture" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaires_revision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reponses_questionnaire" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "questionnaireId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "reponse" "ReponseItem",
    "valeur" TEXT,
    "estException" BOOLEAN NOT NULL DEFAULT false,
    "commentaire" TEXT,
    "renvoiTravaux" TEXT,
    "reponduLe" TIMESTAMP(3),
    "reponduPar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reponses_questionnaire_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "questionnaires_revision_tenantId_exerciceId_idx" ON "questionnaires_revision"("tenantId", "exerciceId");

-- CreateIndex
CREATE INDEX "reponses_questionnaire_tenantId_questionnaireId_idx" ON "reponses_questionnaire"("tenantId", "questionnaireId");

-- CreateIndex
CREATE UNIQUE INDEX "reponses_questionnaire_questionnaireId_code_key" ON "reponses_questionnaire"("questionnaireId", "code");

-- AddForeignKey
ALTER TABLE "questionnaires_revision" ADD CONSTRAINT "questionnaires_revision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaires_revision" ADD CONSTRAINT "questionnaires_revision_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reponses_questionnaire" ADD CONSTRAINT "reponses_questionnaire_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reponses_questionnaire" ADD CONSTRAINT "reponses_questionnaire_questionnaireId_fkey" FOREIGN KEY ("questionnaireId") REFERENCES "questionnaires_revision"("id") ON DELETE CASCADE ON UPDATE CASCADE;
