-- Ligne A14 (2026-10-03) · la sortie d'une immobilisation porte sa NATURE
-- (fiche du compte 81 ; AUDCIF Titre V § 5.8 ; SYCEBNL cadre conceptuel
-- § 5.5 et Partie 3 ch. 3 § 2.5) et la PIÈCE qui la justifie (AUDCIF
-- art. 17, 3° et 5°). Nulles sur les sorties déjà passées · rien n'est
-- reconstitué.
CREATE TYPE "NatureSortieImmobilisation" AS ENUM ('VENTE', 'ECHANGE', 'MISE_AU_REBUT', 'DESTRUCTION', 'VOL', 'DISPARITION', 'REMISE_GRATUITE', 'RESTITUTION');

ALTER TABLE "immobilisations" ADD COLUMN "natureSortie" "NatureSortieImmobilisation";
ALTER TABLE "immobilisations" ADD COLUMN "referencePieceSortie" TEXT;
ALTER TABLE "immobilisations" ADD COLUMN "datePieceSortie" TIMESTAMP(3);
