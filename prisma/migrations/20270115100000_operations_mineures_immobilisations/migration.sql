-- Lot 15 (première part) · petits manques du module des immobilisations.
-- Rente viagère (AUDCIF Titre VIII ch. 11 § 2), redevances sur chiffre
-- d'affaires (ch. 2 § 11), réserve de propriété (ch. 9 ; SYCEBNL cadre
-- conceptuel § 3.3.1.1.6), matériel récupéré à la mise hors service (fiche
-- du compte 38 de l'AUDCIF, fiche du compte 37 du SYCEBNL, ch. 14 § 2.8).

CREATE TYPE "NatureAcquisitionAleatoire" AS ENUM ('RENTE_VIAGERE', 'REDEVANCES');

CREATE TYPE "FondementValeurAleatoire" AS ENUM ('PRIX_STIPULE', 'ESTIMATION_VALEUR_ACTUELLE', 'REDEVANCES_ACTUALISEES', 'VALEUR_DROITS_ENREGISTREMENT');

ALTER TABLE "immobilisations"
  ADD COLUMN "natureAcquisitionAleatoire" "NatureAcquisitionAleatoire",
  ADD COLUMN "fondementValeurAleatoire" "FondementValeurAleatoire",
  ADD COLUMN "sourceValeurAleatoire" TEXT,
  ADD COLUMN "detteAleatoireInitiale" DECIMAL(18,2),
  ADD COLUMN "versementsDetteAleatoire" DECIMAL(18,2),
  ADD COLUMN "sourceVersementsDette" TEXT,
  ADD COLUMN "dateSoldeDetteAleatoire" TIMESTAMP(3),
  ADD COLUMN "ecritureSoldeDetteAleatoireId" TEXT,
  ADD COLUMN "reserveDePropriete" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "reserveProprieteLeveeLe" TIMESTAMP(3),
  ADD COLUMN "valeurMaterielRecupere" DECIMAL(18,2),
  ADD COLUMN "sourceMaterielRecupere" TEXT;

-- L'écriture du solde de la dette est RETENUE · RESTRICT, jamais SET NULL.
CREATE UNIQUE INDEX "immobilisations_ecritureSoldeDetteAleatoireId_key" ON "immobilisations"("ecritureSoldeDetteAleatoireId");

ALTER TABLE "immobilisations" ADD CONSTRAINT "immobilisations_ecritureSoldeDetteAleatoireId_fkey" FOREIGN KEY ("ecritureSoldeDetteAleatoireId") REFERENCES "ecritures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
