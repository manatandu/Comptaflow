-- CreateEnum
CREATE TYPE "TypeAvanceSalaire" AS ENUM ('AVANCE', 'ACOMPTE', 'PRET');

-- CreateEnum
CREATE TYPE "CategoriePretPersonnel" AS ENUM ('IMMOBILIER', 'MOBILIER_ET_INSTALLATION', 'AUTRE');

-- CreateTable
CREATE TABLE "rubriques_paie" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "nature" TEXT NOT NULL,
    "fondement" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rubriques_paie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avances_salaire" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "salarieId" TEXT NOT NULL,
    "type" "TypeAvanceSalaire" NOT NULL,
    "categoriePret" "CategoriePretPersonnel",
    "dateOctroi" DATE NOT NULL,
    "montantFc" DECIMAL(18,2) NOT NULL,
    "retenueMensuelleFc" DECIMAL(18,2),
    "objet" TEXT NOT NULL,
    "pieceJustificative" TEXT NOT NULL,
    "creePar" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avances_salaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "retenues_avance_bulletin" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "avanceId" TEXT NOT NULL,
    "bulletinId" TEXT NOT NULL,
    "montantFc" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "retenues_avance_bulletin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rubriques_paie_tenantId_code_key" ON "rubriques_paie"("tenantId", "code");

-- CreateIndex
CREATE INDEX "avances_salaire_tenantId_salarieId_idx" ON "avances_salaire"("tenantId", "salarieId");

-- CreateIndex
CREATE INDEX "retenues_avance_bulletin_tenantId_avanceId_idx" ON "retenues_avance_bulletin"("tenantId", "avanceId");

-- CreateIndex
CREATE INDEX "retenues_avance_bulletin_bulletinId_idx" ON "retenues_avance_bulletin"("bulletinId");

-- AddForeignKey
ALTER TABLE "rubriques_paie" ADD CONSTRAINT "rubriques_paie_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avances_salaire" ADD CONSTRAINT "avances_salaire_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "avances_salaire" ADD CONSTRAINT "avances_salaire_salarieId_fkey" FOREIGN KEY ("salarieId") REFERENCES "salaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retenues_avance_bulletin" ADD CONSTRAINT "retenues_avance_bulletin_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retenues_avance_bulletin" ADD CONSTRAINT "retenues_avance_bulletin_avanceId_fkey" FOREIGN KEY ("avanceId") REFERENCES "avances_salaire"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "retenues_avance_bulletin" ADD CONSTRAINT "retenues_avance_bulletin_bulletinId_fkey" FOREIGN KEY ("bulletinId") REFERENCES "bulletins_paie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

