-- CreateEnum
CREATE TYPE "TypeDonateur" AS ENUM ('PERSONNE_PHYSIQUE', 'PERSONNE_MORALE');

-- CreateEnum
CREATE TYPE "ModeLiberation" AS ENUM ('ESPECES', 'CHEQUE', 'VIREMENT', 'NATURE');

-- CreateEnum
CREATE TYPE "NatureLiberalite" AS ENUM ('DON', 'DONATION', 'LEGS');

-- CreateTable
CREATE TABLE "registre_donateurs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "dateOperation" TIMESTAMP(3) NOT NULL,
    "nature" "NatureLiberalite" NOT NULL,
    "typeDonateur" "TypeDonateur" NOT NULL,
    "nom" TEXT,
    "prenoms" TEXT,
    "domicile" TEXT,
    "denomination" TEXT,
    "numeroImmatriculation" TEXT,
    "numeroIdentificationFiscale" TEXT,
    "adresseSiegeSocial" TEXT,
    "adresseElectronique" TEXT,
    "montant" DECIMAL(18,2) NOT NULL,
    "modeLiberation" "ModeLiberation" NOT NULL,
    "designationNature" TEXT,
    "signeePar" TEXT,
    "signeeLe" TIMESTAMP(3),
    "ecritureId" TEXT,
    "annulee" BOOLEAN NOT NULL DEFAULT false,
    "motifAnnulation" TEXT,
    "annuleeLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "registre_donateurs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "registre_donateurs_tenantId_dateOperation_idx" ON "registre_donateurs"("tenantId", "dateOperation");

-- CreateIndex
CREATE UNIQUE INDEX "registre_donateurs_tenantId_numero_key" ON "registre_donateurs"("tenantId", "numero");

-- AddForeignKey
ALTER TABLE "registre_donateurs" ADD CONSTRAINT "registre_donateurs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registre_donateurs" ADD CONSTRAINT "registre_donateurs_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
