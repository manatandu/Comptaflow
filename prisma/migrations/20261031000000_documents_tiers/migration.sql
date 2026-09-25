-- Point 21 de la comparaison Sage i7 · documents attachés aux tiers, rangés en base (5 Mo par pièce).
-- CreateTable
CREATE TABLE "documents_tiers" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tiersId" TEXT NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "typeMime" TEXT NOT NULL,
    "taille" INTEGER NOT NULL,
    "empreinte" TEXT NOT NULL,
    "commentaire" VARCHAR(69),
    "contenu" BYTEA NOT NULL,
    "deposePar" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_tiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_tiers_tenantId_tiersId_idx" ON "documents_tiers"("tenantId", "tiersId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_tiers_tiersId_empreinte_key" ON "documents_tiers"("tiersId", "empreinte");

-- AddForeignKey
ALTER TABLE "documents_tiers" ADD CONSTRAINT "documents_tiers_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents_tiers" ADD CONSTRAINT "documents_tiers_tiersId_fkey" FOREIGN KEY ("tiersId") REFERENCES "tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

