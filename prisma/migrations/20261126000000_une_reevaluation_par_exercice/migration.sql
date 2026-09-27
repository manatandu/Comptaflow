-- UNE SEULE RÉÉVALUATION PASSÉE PAR EXERCICE (audit final F54) · ses écarts
-- sont passés sans devise, et une seconde, à une autre date, repassait
-- l'écart entier et doublait la provision. Le service refuse, l'index tient
-- la règle contre deux clics simultanés.

-- DropIndex
DROP INDEX "reevaluations_tenantId_exerciceId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "reevaluations_tenantId_exerciceId_key" ON "reevaluations"("tenantId", "exerciceId");

