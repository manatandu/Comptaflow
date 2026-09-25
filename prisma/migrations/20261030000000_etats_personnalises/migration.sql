-- Point 20 de la comparaison Sage i7 · états personnalisés.
-- CreateTable
CREATE TABLE "etats_personnalises" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "lignes" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "etats_personnalises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "etats_personnalises_tenantId_nom_key" ON "etats_personnalises"("tenantId", "nom");

-- AddForeignKey
ALTER TABLE "etats_personnalises" ADD CONSTRAINT "etats_personnalises_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

