-- Un bien acquis n'est pas forcément mis en service · la date de début
-- d'amortissement est celle de la mise en état de fonctionner (AUDCIF
-- art. 45), et elle reste nulle tant que le bien ne sert pas.
ALTER TABLE "immobilisations" ALTER COLUMN "dateMiseEnService" DROP NOT NULL;

-- Nature du bien au barème de l'arrêté n° 013/CAB/MIN/FINANCES/2025, art. 2 ·
-- sans effet de calcul, gardée pour confronter la durée comptable au barème.
ALTER TABLE "immobilisations" ADD COLUMN "natureFiscaleCle" TEXT;
