-- LOT 15 (seconde part) · petits manques du module des immobilisations.
--
-- (1) Les six critères des frais de développement (211, SYSCOHADA) · AUDCIF
--     Titre VIII ch. 1 § 2.1.1 et § 3.1 ; fiche du compte 211.
ALTER TABLE "immobilisations" ADD COLUMN "criteresFraisDeveloppement" JSONB;
ALTER TABLE "immobilisations" ADD COLUMN "dateReunionCriteresDeveloppement" TIMESTAMP(3);

-- (3) Le composant démantèlement · coût attendu au terme et taux
--     d'actualisation déclarés (AUDCIF Titre VIII ch. 6 § 2.3), et les
--     mouvements de la provision 1984 qui suivent son entrée (désactualisation
--     annuelle, § 2.3 ; reprise, § 4.1 et § 4.2).
ALTER TABLE "immobilisations" ADD COLUMN "coutFuturDemantelement" DECIMAL(18,2);
ALTER TABLE "immobilisations" ADD COLUMN "tauxActualisationDemantelementPourcent" DECIMAL(9,4);

CREATE TYPE "NatureMouvementDemantelement" AS ENUM ('DESACTUALISATION', 'REPRISE');
CREATE TYPE "MotifRepriseDemantelement" AS ENUM ('ENGAGEMENT_COUTS', 'CESSION_SOUS_JACENT');

CREATE TABLE "mouvements_demantelement" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "immobilisationId" TEXT NOT NULL,
    "exerciceId" TEXT NOT NULL,
    "nature" "NatureMouvementDemantelement" NOT NULL,
    "date" DATE NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "repriseExploitation" DECIMAL(18,2),
    "repriseFinanciere" DECIMAL(18,2),
    "motifReprise" "MotifRepriseDemantelement",
    "ecritureId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,

    CONSTRAINT "mouvements_demantelement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "mouvements_demantelement_ecritureId_key" ON "mouvements_demantelement"("ecritureId");
CREATE UNIQUE INDEX "mouvements_demantelement_immobilisationId_exerciceId_nature_key" ON "mouvements_demantelement"("immobilisationId", "exerciceId", "nature");
CREATE INDEX "mouvements_demantelement_tenantId_idx" ON "mouvements_demantelement"("tenantId");
CREATE INDEX "mouvements_demantelement_exerciceId_idx" ON "mouvements_demantelement"("exerciceId");

ALTER TABLE "mouvements_demantelement" ADD CONSTRAINT "mouvements_demantelement_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mouvements_demantelement" ADD CONSTRAINT "mouvements_demantelement_immobilisationId_fkey" FOREIGN KEY ("immobilisationId") REFERENCES "immobilisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mouvements_demantelement" ADD CONSTRAINT "mouvements_demantelement_exerciceId_fkey" FOREIGN KEY ("exerciceId") REFERENCES "exercices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "mouvements_demantelement" ADD CONSTRAINT "mouvements_demantelement_ecritureId_fkey" FOREIGN KEY ("ecritureId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- (4) Location-acquisition · garantie de valeur résiduelle et loyers indexés,
--     au nombre des paiements locatifs (AUDCIF Titre VIII ch. 8 § 2.1.2).
ALTER TABLE "contrats_location_acquisition" ADD COLUMN "garantieValeurResiduelle" DECIMAL(18,2) NOT NULL DEFAULT 0;
ALTER TABLE "contrats_location_acquisition" ADD COLUMN "garantieAppelee" BOOLEAN;
ALTER TABLE "contrats_location_acquisition" ADD COLUMN "loyerIndexe" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "contrats_location_acquisition" ADD COLUMN "indiceLoyer" TEXT;
ALTER TABLE "contrats_location_acquisition" ADD COLUMN "valeurIndiceCommencement" DECIMAL(18,6);
