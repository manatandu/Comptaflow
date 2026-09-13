-- LA DIXIÈME MENTION, que le décret n° 23/10 du 3 mars 2023 a ajoutée et que
-- le module ne portait pas.
--
-- Art. 26 j) · « le montant de tous autres impôts et taxes, LE CAS ÉCHÉANT ».
-- L'art. 100 du décret n° 011/42 de 2011, sur lequel le module avait été bâti,
-- n'en portait que neuf ; le décret de 2023 en porte douze et abroge « les
-- dispositions antérieures contraires » (art. 28). Deux des douze (k et l)
-- viennent du dispositif électronique fiscal et sont retirées du document en
-- tenant lieu par le dernier alinéa du même article : dix restent dues.
--
-- NULLABLE À DESSEIN · « le cas échéant » veut dire « s'il y en a », pas « si
-- vous voulez ». Un défaut à zéro aurait répondu à la place du comptable sur
-- chaque facture. Les factures déjà saisies restent donc à NULL, ce qui est
-- l'état vrai : personne ne leur a posé la question.

-- AlterTable
ALTER TABLE "factures" ADD COLUMN     "autresImpotsEtTaxes" DECIMAL(18,2);
