-- LA CONSIGNATION D'EMBALLAGES · le compte d'attente qu'il faut dénouer.
--
-- « Les comptes relatifs aux emballages fonctionnent de la même manière que
-- ceux relatifs aux marchandises et matières. La seule particularité concerne
-- la CONSIGNATION. » Les deux textes la décrivent en miroir, aux fiches des
-- comptes 40 et 41 (AUDCIF Titre VII · SYCEBNL Partie 2 ch. 3).
--
-- POURQUOI UNE TABLE · le 4094 et le 4194 sont des comptes d'ATTENTE. Un 4194
-- laissé en l'état à la clôture est une dette envers un client qui, peut-être,
-- ne rendra jamais l'emballage : le bilan est faux du montant des
-- consignations non qualifiées, et la balance boucle quand même.
--
-- `prixDeReprise` EST NULLABLE À DESSEIN · il n'est renseigné que pour la
-- reprise sous le prix de consignation, seul cas où les deux fiches décrivent
-- un écart. Un défaut à zéro ferait de toute restitution une reprise à prix
-- nul, c'est-à-dire un boni égal à la consignation entière.

-- CreateEnum
CREATE TYPE "SensConsignation" AS ENUM ('EMISE', 'RECUE');

-- CreateEnum
CREATE TYPE "NatureObjetConsigne" AS ENUM ('EMBALLAGE', 'MATERIEL');

-- CreateEnum
CREATE TYPE "EtatConsignation" AS ENUM ('EN_COURS', 'RESTITUEE', 'CONSERVEE', 'REPRISE_SOUS_PRIX');

-- CreateTable
CREATE TABLE "consignations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "tiersId" TEXT NOT NULL,
    "sens" "SensConsignation" NOT NULL,
    "nature" "NatureObjetConsigne" NOT NULL,
    "designation" TEXT NOT NULL,
    "quantite" DECIMAL(18,3),
    "dateConsignation" TIMESTAMP(3) NOT NULL,
    "montant" DECIMAL(18,2) NOT NULL,
    "etat" "EtatConsignation" NOT NULL DEFAULT 'EN_COURS',
    "dateDenouement" TIMESTAMP(3),
    "prixDeReprise" DECIMAL(18,2),
    "ecritureConsignationId" TEXT,
    "ecritureDenouementId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "consignations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "consignations_tenantId_etat_idx" ON "consignations"("tenantId", "etat");

-- CreateIndex
CREATE INDEX "consignations_tenantId_tiersId_idx" ON "consignations"("tenantId", "tiersId");

-- AddForeignKey
ALTER TABLE "consignations" ADD CONSTRAINT "consignations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignations" ADD CONSTRAINT "consignations_tiersId_fkey" FOREIGN KEY ("tiersId") REFERENCES "tiers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignations" ADD CONSTRAINT "consignations_ecritureConsignationId_fkey" FOREIGN KEY ("ecritureConsignationId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consignations" ADD CONSTRAINT "consignations_ecritureDenouementId_fkey" FOREIGN KEY ("ecritureDenouementId") REFERENCES "ecritures"("id") ON DELETE SET NULL ON UPDATE CASCADE;
