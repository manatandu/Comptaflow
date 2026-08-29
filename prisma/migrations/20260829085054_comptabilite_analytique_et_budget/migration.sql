-- CreateTable
CREATE TABLE "plans_analytiques" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "classesVentilees" TEXT NOT NULL DEFAULT '2,6,7,9',
    "ventilationObligatoire" BOOLEAN NOT NULL DEFAULT false,
    "gererBudgets" BOOLEAN NOT NULL DEFAULT true,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "estActif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plans_analytiques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sections_analytiques" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "type" "TypeCompteDetailTotal" NOT NULL DEFAULT 'DETAIL',
    "bailleurId" TEXT,
    "dateDebut" TIMESTAMP(3),
    "dateFin" TIMESTAMP(3),
    "estActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sections_analytiques_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets_section" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "mois" INTEGER,
    "montant" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "budgets_section_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ventilations_analytiques" (
    "id" TEXT NOT NULL,
    "ligneEcritureId" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "debit" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ventilations_analytiques_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_analytiques_tenantId_code_key" ON "plans_analytiques"("tenantId", "code");

-- CreateIndex
CREATE INDEX "sections_analytiques_tenantId_idx" ON "sections_analytiques"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "sections_analytiques_planId_code_key" ON "sections_analytiques"("planId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_section_sectionId_exerciceId_mois_key" ON "budgets_section"("sectionId", "exerciceId", "mois");

-- CreateIndex
CREATE INDEX "ventilations_analytiques_ligneEcritureId_idx" ON "ventilations_analytiques"("ligneEcritureId");

-- CreateIndex
CREATE INDEX "ventilations_analytiques_sectionId_idx" ON "ventilations_analytiques"("sectionId");

-- AddForeignKey
ALTER TABLE "plans_analytiques" ADD CONSTRAINT "plans_analytiques_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections_analytiques" ADD CONSTRAINT "sections_analytiques_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans_analytiques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections_analytiques" ADD CONSTRAINT "sections_analytiques_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sections_analytiques" ADD CONSTRAINT "sections_analytiques_bailleurId_fkey" FOREIGN KEY ("bailleurId") REFERENCES "bailleurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets_section" ADD CONSTRAINT "budgets_section_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections_analytiques"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets_section" ADD CONSTRAINT "budgets_section_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventilations_analytiques" ADD CONSTRAINT "ventilations_analytiques_ligneEcritureId_fkey" FOREIGN KEY ("ligneEcritureId") REFERENCES "lignes_ecriture"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ventilations_analytiques" ADD CONSTRAINT "ventilations_analytiques_sectionId_fkey" FOREIGN KEY ("sectionId") REFERENCES "sections_analytiques"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
