-- LIGNE A7, seconde relecture.
--
-- K1 · la récupération de la TVA d'une perte est rattachée à la LIQUIDATION qui
-- l'impute, jamais au calendrier (décret n° 011/42, art. 126, « la
-- déclaration du ou des mois suivants ») · posée par la liquidation, remise à
-- null par son annulation.
-- K3 · la TVA d'une vente exigible à l'encaissement sort du 443 sans entrer
-- dans aucune déclaration (O.-L. n° 10/001, art. 25, 2°), et la facture
-- d'origine se DÉCLARE au reclassement, jamais lue sur le lettrage.
-- K4 · un mouvement s'ANNULE (AUDCIF art. 20, al. 2) · marqué, jamais
-- supprimé ; son écriture supprimée au brouillard laisse le lien vide.
ALTER TABLE "mouvements_creances_douteuses" ADD COLUMN "tvaNonExigible" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mouvements_creances_douteuses" ADD COLUMN "liquidationRecuperationId" TEXT;
ALTER TABLE "mouvements_creances_douteuses" ADD COLUMN "annuleeLe" TIMESTAMP(3);
ALTER TABLE "mouvements_creances_douteuses" ADD COLUMN "annuleePar" TEXT;
ALTER TABLE "mouvements_creances_douteuses" ADD COLUMN "motifAnnulation" TEXT;
ALTER TABLE "mouvements_creances_douteuses" ADD COLUMN "annulation" JSONB;
ALTER TABLE "mouvements_creances_douteuses" ALTER COLUMN "ecritureId" DROP NOT NULL;

CREATE INDEX "mouvements_creances_douteuses_liquidationRecuperationId_idx" ON "mouvements_creances_douteuses"("liquidationRecuperationId");

ALTER TABLE "mouvements_creances_douteuses" ADD CONSTRAINT "mouvements_creances_douteuses_liquidationRecuperationId_fkey" FOREIGN KEY ("liquidationRecuperationId") REFERENCES "liquidations_tva"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "origines_creances_douteuses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "creanceId" TEXT NOT NULL,
    "ecritureId" TEXT NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "origines_creances_douteuses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "origines_creances_douteuses_tenantId_idx" ON "origines_creances_douteuses"("tenantId");
CREATE INDEX "origines_creances_douteuses_ecritureId_idx" ON "origines_creances_douteuses"("ecritureId");
CREATE UNIQUE INDEX "origines_creances_douteuses_creanceId_ecritureId_key" ON "origines_creances_douteuses"("creanceId", "ecritureId");

ALTER TABLE "origines_creances_douteuses" ADD CONSTRAINT "origines_creances_douteuses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "origines_creances_douteuses" ADD CONSTRAINT "origines_creances_douteuses_creanceId_fkey" FOREIGN KEY ("creanceId") REFERENCES "creances_douteuses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "origines_creances_douteuses" ADD CONSTRAINT "origines_creances_douteuses_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
