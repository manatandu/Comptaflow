-- CreateEnum
CREATE TYPE "Referentiel" AS ENUM ('SYCEBNL', 'SYSCOHADA');

-- CreateEnum
CREATE TYPE "TypeLicence" AS ENUM ('ABONNEMENT', 'PERPETUEL_SAAS', 'PERPETUEL_ONPREMISE');

-- CreateEnum
CREATE TYPE "StatutLicence" AS ENUM ('ACTIVE', 'EXPIREE', 'SUSPENDUE');

-- CreateEnum
CREATE TYPE "RoleUtilisateur" AS ENUM ('ADMIN_CABINET', 'COMPTABLE', 'LECTURE_SEULE');

-- CreateEnum
CREATE TYPE "ClasseCompte" AS ENUM ('CLASSE_1', 'CLASSE_2', 'CLASSE_3', 'CLASSE_4', 'CLASSE_5', 'CLASSE_6', 'CLASSE_7', 'CLASSE_8', 'CLASSE_9');

-- CreateEnum
CREATE TYPE "StatutExercice" AS ENUM ('OUVERT', 'CLOTURE');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "referentiel" "Referentiel" NOT NULL DEFAULT 'SYCEBNL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licences" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "type" "TypeLicence" NOT NULL,
    "statut" "StatutLicence" NOT NULL DEFAULT 'ACTIVE',
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateExpiration" TIMESTAMP(3),
    "dernierHeartbeatAt" TIMESTAMP(3),
    "joursGraceHorsLigne" INTEGER NOT NULL DEFAULT 7,

    CONSTRAINT "licences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasse" TEXT NOT NULL,
    "role" "RoleUtilisateur" NOT NULL DEFAULT 'COMPTABLE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comptes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "classe" "ClasseCompte" NOT NULL,
    "estActif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "comptes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "exercices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "statut" "StatutExercice" NOT NULL DEFAULT 'OUVERT',

    CONSTRAINT "exercices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ecritures" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "journalCode" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "libelle" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "ecritures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_ecriture" (
    "id" TEXT NOT NULL,
    "ecritureId" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "libelle" TEXT,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "lignes_ecriture_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "licences_tenantId_key" ON "licences"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "comptes_tenantId_numero_key" ON "comptes"("tenantId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "exercices_tenantId_dateDebut_dateFin_key" ON "exercices"("tenantId", "dateDebut", "dateFin");

-- AddForeignKey
ALTER TABLE "licences" ADD CONSTRAINT "licences_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comptes" ADD CONSTRAINT "comptes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exercices" ADD CONSTRAINT "exercices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecritures" ADD CONSTRAINT "ecritures_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ecritures" ADD CONSTRAINT "ecritures_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_ecriture" ADD CONSTRAINT "lignes_ecriture_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_ecriture" ADD CONSTRAINT "lignes_ecriture_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
