-- CreateTable
CREATE TABLE "modeles_bulletin" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "categorie" TEXT,
    "deviseStipulation" TEXT NOT NULL DEFAULT 'CDF',
    "lignes" JSONB NOT NULL,
    "creePar" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modeles_bulletin_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "modeles_bulletin_tenantId_nom_key" ON "modeles_bulletin"("tenantId", "nom");

-- AddForeignKey
ALTER TABLE "modeles_bulletin" ADD CONSTRAINT "modeles_bulletin_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

