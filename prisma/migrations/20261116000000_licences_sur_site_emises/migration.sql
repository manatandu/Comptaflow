-- Registre des licences d'installation sur site émises par la console de VMG.

-- CreateTable
CREATE TABLE "licences_sur_site_emises" (
    "id" TEXT NOT NULL,
    "numero" TEXT NOT NULL,
    "titulaire" TEXT NOT NULL,
    "empreinteMachine" TEXT NOT NULL,
    "emiseLe" TEXT NOT NULL,
    "finMaintenance" TEXT NOT NULL,
    "expiration" TEXT,
    "dossiersMax" INTEGER NOT NULL,
    "fichier" TEXT NOT NULL,
    "emisePar" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licences_sur_site_emises_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "licences_sur_site_emises_numero_key" ON "licences_sur_site_emises"("numero");

-- CreateIndex
CREATE INDEX "licences_sur_site_emises_empreinteMachine_idx" ON "licences_sur_site_emises"("empreinteMachine");
