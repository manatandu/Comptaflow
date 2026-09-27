-- Audit final de la 1.0, F32 · un bien REPRIS (acquis avant l'exercice, déjà
-- porté par le bilan d'ouverture) n'a pas d'écriture d'acquisition dans le
-- dossier. L'exiger doublait le compte 2 repris à l'ouverture, et la date
-- d'acquisition hors de l'exercice la faisait refuser de toute façon.
ALTER TABLE "immobilisations" ALTER COLUMN "ecritureAcquisitionId" DROP NOT NULL;
