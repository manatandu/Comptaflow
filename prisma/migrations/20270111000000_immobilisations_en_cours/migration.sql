-- IMMOBILISATION EN COURS (fiches des comptes 21 à 24, AUDCIF Titre VII ;
-- SYCEBNL Partie 2 ch. 3, comptes 23 et 24) · le bien non achevé est inscrit
-- au 219, 229, 239 ou 249, et « après achèvement » porté à son compte
-- définitif par le crédit de l'en-cours. Le compte en cours et l'écriture de
-- mise en service sont RESTRICT, déclarés au schéma · Prisma poserait SET
-- NULL sur une relation facultative, et la fiche perdrait en silence le
-- compte que sa mise en service crédite, ou l'écriture qui l'a virée.
ALTER TABLE "immobilisations" ADD COLUMN "compteEnCoursId" TEXT;
ALTER TABLE "immobilisations" ADD COLUMN "ecritureMiseEnServiceId" TEXT;

CREATE UNIQUE INDEX "immobilisations_ecritureMiseEnServiceId_key" ON "immobilisations"("ecritureMiseEnServiceId");

ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_compteEnCoursId_fkey" FOREIGN KEY ("compteEnCoursId") REFERENCES "comptes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_ecritureMiseEnServiceId_fkey" FOREIGN KEY ("ecritureMiseEnServiceId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
