-- CreateIndex
CREATE INDEX "ecritures_tenantId_exerciceId_date_idx" ON "ecritures"("tenantId", "exerciceId", "date");

-- CreateIndex
CREATE INDEX "lignes_ecriture_ecritureId_idx" ON "lignes_ecriture"("ecritureId");
