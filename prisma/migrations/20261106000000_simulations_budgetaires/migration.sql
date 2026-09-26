-- Simulations budgétaires (priorité 6) · hypothèses seules, montants recalculés.

-- CreateTable
CREATE TABLE "simulations_budgetaires" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "exerciceReferenceId" TEXT NOT NULL,
    "exerciceCibleId" TEXT NOT NULL,
    "hypotheses" JSONB NOT NULL,
    "seuilOrangePct" DECIMAL(7,2) NOT NULL,
    "seuilRougePct" DECIMAL(7,2) NOT NULL,
    "creePar" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "simulations_budgetaires_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "simulations_budgetaires_tenantId_nom_key" ON "simulations_budgetaires"("tenantId", "nom");

-- AddForeignKey
ALTER TABLE "simulations_budgetaires" ADD CONSTRAINT "simulations_budgetaires_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulations_budgetaires" ADD CONSTRAINT "simulations_budgetaires_exerciceReferenceId_fkey" FOREIGN KEY ("exerciceReferenceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "simulations_budgetaires" ADD CONSTRAINT "simulations_budgetaires_exerciceCibleId_fkey" FOREIGN KEY ("exerciceCibleId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

