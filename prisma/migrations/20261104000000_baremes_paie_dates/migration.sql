-- Versions de barème de paie saisies par le cabinet (taux CNSS, INPP, ONEM).
-- Voir src/modules/personnel/baremes-dossier.ts.

-- CreateTable
CREATE TABLE "versions_baremes_paie" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "bareme" TEXT NOT NULL,
    "aPartirDu" TEXT NOT NULL,
    "valeurs" JSONB NOT NULL,
    "reference" TEXT NOT NULL,
    "saisiPar" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "versions_baremes_paie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "versions_baremes_paie_tenantId_bareme_aPartirDu_key" ON "versions_baremes_paie"("tenantId", "bareme", "aPartirDu");

-- AddForeignKey
ALTER TABLE "versions_baremes_paie" ADD CONSTRAINT "versions_baremes_paie_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

