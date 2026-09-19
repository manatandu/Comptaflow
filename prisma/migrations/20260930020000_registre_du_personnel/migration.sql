-- CreateEnum
CREATE TYPE "SexeTravailleur" AS ENUM ('MASCULIN', 'FEMININ');

-- CreateEnum
CREATE TYPE "TypeContratTravail" AS ENUM ('DUREE_DETERMINEE', 'DUREE_INDETERMINEE', 'JOUR_LE_JOUR', 'APPRENTISSAGE');

-- AlterTable
ALTER TABLE "tenants" ADD COLUMN     "numeroAffiliationCnssEmployeur" TEXT;

-- CreateTable
CREATE TABLE "salaries" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "matricule" TEXT,
    "nom" TEXT NOT NULL,
    "postNom" TEXT,
    "prenoms" TEXT,
    "sexe" "SexeTravailleur" NOT NULL,
    "numeroAffiliationCnss" TEXT,
    "dateNaissance" TIMESTAMP(3),
    "millesimeNaissance" INTEGER,
    "lieuNaissance" TEXT,
    "nationalite" TEXT,
    "nomConjoint" TEXT,
    "aptitudeConstateeLe" TIMESTAMP(3),
    "aptitudeConstateePar" TEXT,
    "aptitudeProvisoire" BOOLEAN NOT NULL DEFAULT false,
    "declarationEngagementLe" TIMESTAMP(3),
    "declarationDepartLe" TIMESTAMP(3),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "enfants_a_charge" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "salarieId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "postNom" TEXT,
    "prenoms" TEXT,
    "dateNaissance" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "enfants_a_charge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrats_travail" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "salarieId" TEXT NOT NULL,
    "type" "TypeContratTravail" NOT NULL,
    "constateParEcrit" BOOLEAN NOT NULL DEFAULT true,
    "dateEntreeEnVigueur" TIMESTAMP(3) NOT NULL,
    "dateConclusion" TIMESTAMP(3),
    "lieuConclusion" TEXT,
    "dateFinPrevue" TIMESTAMP(3),
    "separeDeSaFamille" BOOLEAN NOT NULL DEFAULT false,
    "ouvrageDetermine" TEXT,
    "motifRemplacement" TEXT,
    "emploiPermanent" BOOLEAN NOT NULL DEFAULT false,
    "natureTravail" TEXT,
    "lieuExecution" TEXT,
    "categorieProfessionnelle" TEXT,
    "manoeuvreSansSpecialite" BOOLEAN NOT NULL DEFAULT false,
    "remunerationBase" DECIMAL(18,2),
    "avantagesConvenus" TEXT,
    "clauseEssai" BOOLEAN NOT NULL DEFAULT false,
    "essaiConstateParEcrit" BOOLEAN NOT NULL DEFAULT false,
    "essaiDureeJours" INTEGER,
    "dureePreavisJours" INTEGER,
    "viseParOnem" BOOLEAN NOT NULL DEFAULT false,
    "dateVisaOnem" TIMESTAMP(3),
    "renouvelleDeId" TEXT,
    "dateFin" TIMESTAMP(3),
    "motifFin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contrats_travail_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salaries_tenantId_actif_idx" ON "salaries"("tenantId", "actif");

-- CreateIndex
CREATE INDEX "salaries_tenantId_nom_idx" ON "salaries"("tenantId", "nom");

-- CreateIndex
CREATE UNIQUE INDEX "salaries_tenantId_matricule_key" ON "salaries"("tenantId", "matricule");

-- CreateIndex
CREATE INDEX "enfants_a_charge_tenantId_salarieId_idx" ON "enfants_a_charge"("tenantId", "salarieId");

-- CreateIndex
CREATE UNIQUE INDEX "contrats_travail_renouvelleDeId_key" ON "contrats_travail"("renouvelleDeId");

-- CreateIndex
CREATE INDEX "contrats_travail_tenantId_salarieId_idx" ON "contrats_travail"("tenantId", "salarieId");

-- CreateIndex
CREATE INDEX "contrats_travail_tenantId_dateEntreeEnVigueur_idx" ON "contrats_travail"("tenantId", "dateEntreeEnVigueur");

-- AddForeignKey
ALTER TABLE "salaries" ADD CONSTRAINT "salaries_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enfants_a_charge" ADD CONSTRAINT "enfants_a_charge_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "enfants_a_charge" ADD CONSTRAINT "enfants_a_charge_salarieId_fkey" FOREIGN KEY ("salarieId") REFERENCES "salaries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrats_travail" ADD CONSTRAINT "contrats_travail_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrats_travail" ADD CONSTRAINT "contrats_travail_salarieId_fkey" FOREIGN KEY ("salarieId") REFERENCES "salaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrats_travail" ADD CONSTRAINT "contrats_travail_renouvelleDeId_fkey" FOREIGN KEY ("renouvelleDeId") REFERENCES "contrats_travail"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

