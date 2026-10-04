-- Ligne A20, seconde relecture · les comportements de gestion d'un exercice
-- clos, figés avant la première déclaration qui suit sa clôture, pour que son
-- seuil et son coût de production ne se récrivent pas en silence.

-- CreateTable
CREATE TABLE "comportements_gestion_figes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "comportements" JSONB NOT NULL,
    "figeLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comportements_gestion_figes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "comportements_gestion_figes_exerciceId_key" ON "comportements_gestion_figes"("exerciceId");

-- CreateIndex
CREATE INDEX "comportements_gestion_figes_tenantId_idx" ON "comportements_gestion_figes"("tenantId");

-- AddForeignKey
ALTER TABLE "comportements_gestion_figes" ADD CONSTRAINT "comportements_gestion_figes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comportements_gestion_figes" ADD CONSTRAINT "comportements_gestion_figes_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

