-- CreateTable
CREATE TABLE "transcriptions_inventaire" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "jeu" "JeuEtatsFinanciersSycebnl" NOT NULL,
    "etats" JSONB NOT NULL,
    "documentsManquants" JSONB NOT NULL,
    "resumeOperationInventaire" TEXT,
    "transcritLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transcritPar" TEXT NOT NULL,

    CONSTRAINT "transcriptions_inventaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rapports_activite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "etabliLe" TIMESTAMP(3) NOT NULL,
    "etabliPar" TEXT NOT NULL,
    "situationExerciceEcoule" TEXT,
    "perspectivesDeveloppement" TEXT,
    "evolutionTresorerie" TEXT,
    "evenementsPosterieurs" TEXT,
    "entiteAvecAuditeur" BOOLEAN NOT NULL DEFAULT false,
    "declarationDirigeants" TEXT,
    "tresorerie" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rapports_activite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "transcriptions_inventaire_tenantId_exerciceId_idx" ON "transcriptions_inventaire"("tenantId", "exerciceId");

-- CreateIndex
CREATE UNIQUE INDEX "transcriptions_inventaire_tenantId_exerciceId_version_key" ON "transcriptions_inventaire"("tenantId", "exerciceId", "version");

-- CreateIndex
CREATE INDEX "rapports_activite_tenantId_exerciceId_idx" ON "rapports_activite"("tenantId", "exerciceId");

-- CreateIndex
CREATE UNIQUE INDEX "rapports_activite_tenantId_exerciceId_version_key" ON "rapports_activite"("tenantId", "exerciceId", "version");

-- AddForeignKey
ALTER TABLE "transcriptions_inventaire" ADD CONSTRAINT "transcriptions_inventaire_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transcriptions_inventaire" ADD CONSTRAINT "transcriptions_inventaire_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rapports_activite" ADD CONSTRAINT "rapports_activite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rapports_activite" ADD CONSTRAINT "rapports_activite_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
