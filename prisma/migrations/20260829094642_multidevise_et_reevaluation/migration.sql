-- AlterTable
ALTER TABLE "lignes_ecriture" ADD COLUMN     "coursApplique" DECIMAL(18,6),
ADD COLUMN     "deviseId" TEXT,
ADD COLUMN     "montantDevise" DECIMAL(18,2);

-- CreateTable
CREATE TABLE "devises" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "estActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "devises_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cours_devise" (
    "id" TEXT NOT NULL,
    "deviseId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "cours" DECIMAL(18,6) NOT NULL,
    "source" TEXT,

    CONSTRAINT "cours_devise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reevaluations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "dateReevaluation" TIMESTAMP(3) NOT NULL,
    "ecritureEcartsId" TEXT,
    "ecritureProvisionId" TEXT,
    "ecritureExtourneId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "reevaluations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "devises_tenantId_code_key" ON "devises"("tenantId", "code");

-- CreateIndex
CREATE INDEX "cours_devise_deviseId_date_idx" ON "cours_devise"("deviseId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "cours_devise_deviseId_date_key" ON "cours_devise"("deviseId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "reevaluations_ecritureEcartsId_key" ON "reevaluations"("ecritureEcartsId");

-- CreateIndex
CREATE UNIQUE INDEX "reevaluations_ecritureProvisionId_key" ON "reevaluations"("ecritureProvisionId");

-- CreateIndex
CREATE UNIQUE INDEX "reevaluations_ecritureExtourneId_key" ON "reevaluations"("ecritureExtourneId");

-- CreateIndex
CREATE INDEX "reevaluations_tenantId_exerciceId_idx" ON "reevaluations"("tenantId", "exerciceId");

-- AddForeignKey
ALTER TABLE "lignes_ecriture" ADD CONSTRAINT "lignes_ecriture_deviseId_fkey" FOREIGN KEY ("deviseId") REFERENCES "devises"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "devises" ADD CONSTRAINT "devises_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cours_devise" ADD CONSTRAINT "cours_devise_deviseId_fkey" FOREIGN KEY ("deviseId") REFERENCES "devises"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reevaluations" ADD CONSTRAINT "reevaluations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reevaluations" ADD CONSTRAINT "reevaluations_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reevaluations" ADD CONSTRAINT "reevaluations_ecritureEcartsId_fkey" FOREIGN KEY ("ecritureEcartsId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reevaluations" ADD CONSTRAINT "reevaluations_ecritureProvisionId_fkey" FOREIGN KEY ("ecritureProvisionId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reevaluations" ADD CONSTRAINT "reevaluations_ecritureExtourneId_fkey" FOREIGN KEY ("ecritureExtourneId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
