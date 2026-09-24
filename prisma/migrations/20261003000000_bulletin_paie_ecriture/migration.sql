-- P9 · l'écriture de paie du mois qui porte chaque bulletin.
ALTER TABLE "bulletins_paie" ADD COLUMN "ecritureId" TEXT;

-- CreateIndex
CREATE INDEX "bulletins_paie_tenantId_ecritureId_idx" ON "bulletins_paie"("tenantId", "ecritureId");

-- AddForeignKey
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
