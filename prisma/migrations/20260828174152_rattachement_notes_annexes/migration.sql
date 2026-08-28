-- CreateTable
CREATE TABLE "rattachements_notes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "jeu" "JeuEtatsFinanciersSycebnl" NOT NULL,
    "codeNote" TEXT NOT NULL,
    "cleRubrique" TEXT NOT NULL,
    "compteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "rattachements_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rattachements_notes_tenantId_jeu_codeNote_idx" ON "rattachements_notes"("tenantId", "jeu", "codeNote");

-- CreateIndex
CREATE UNIQUE INDEX "rattachements_notes_tenantId_jeu_codeNote_cleRubrique_compt_key" ON "rattachements_notes"("tenantId", "jeu", "codeNote", "cleRubrique", "compteId");

-- AddForeignKey
ALTER TABLE "rattachements_notes" ADD CONSTRAINT "rattachements_notes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rattachements_notes" ADD CONSTRAINT "rattachements_notes_compteId_fkey" FOREIGN KEY ("compteId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
