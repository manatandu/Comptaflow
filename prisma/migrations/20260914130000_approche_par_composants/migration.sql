-- APPROCHE PAR COMPOSANTS · AUDCIF Titre VIII ch. 4 ; SYCEBNL, Partie 2 ch. 3,
-- règles générales de la classe 2.
--
-- « Lorsqu'un ou plusieurs éléments constitutifs d'un actif ont chacun des
-- utilisations différentes, ou procurent des avantages économiques à l'entité
-- selon un rythme différent, chaque élément peut être comptabilisé séparément
-- DANS UN SOUS-COMPTE DE L'IMMOBILISATION PRINCIPALE et un plan
-- d'amortissement propre à chacun de ces éléments est retenu. »
--
-- Le module savait déjà tenir plusieurs biens avec des durées différentes. Ce
-- qui manquait est le RATTACHEMENT : un ascenseur amorti sur dix ans dans un
-- immeuble amorti sur quarante n'était qu'une ligne de plus, sans lien, et son
-- renouvellement ne sortait donc rien de l'actif · alors que le texte l'exige
-- (§ 1, « la valeur nette comptable du composant remplacé doit être sortie de
-- l'actif »).
--
-- LES DEUX TEXTES NE FERMENT PAS LA LISTE DE LA MÊME FAÇON, et c'est pour cela
-- que la vérification vit dans le service et non ici :
--  · le SYCEBNL écrit « la décomposition de ces immobilisations N'EST AUTORISÉE
--    QUE POUR les bâtiments et autres ouvrages, les avions, les bateaux, les
--    camions, les autocars, les bus, les véhicules blindés de transport de
--    fonds, certains matériels et outillages des entités industrielles,
--    minières, agricoles, hospitalières et pétrolières » ;
--  · l'AUDCIF donne la même énumération « par exemple », puis une liste
--    NÉGATIVE : matériels informatiques, véhicules de tourisme, matériels et
--    mobiliers.
CREATE TYPE "TypeComposant" AS ENUM (
  'COMPOSANT',
  'DEMANTELEMENT',
  'REVISION_MAJEURE',
  'PIECE_DE_RECHANGE',
  'PIECE_DE_SECURITE'
);

ALTER TABLE "immobilisations"
  ADD COLUMN "immobilisationPrincipaleId" TEXT,
  ADD COLUMN "typeComposant"              "TypeComposant",
  -- Les conditions de décomposition ne sont pas vérifiables par un logiciel
  -- (durées d'utilité distinctes, caractère significatif, statistiques
  -- disponibles) · il les fait écrire plutôt que de les deviner.
  ADD COLUMN "justificationDecomposition" TEXT,
  -- Chaîne des remplacements · AUDCIF ch. 4 § 4.1.
  ADD COLUMN "composantRemplaceId"        TEXT;

CREATE INDEX "immobilisations_immobilisationPrincipaleId_idx"
  ON "immobilisations"("immobilisationPrincipaleId");
CREATE UNIQUE INDEX "immobilisations_composantRemplaceId_key"
  ON "immobilisations"("composantRemplaceId");

ALTER TABLE "immobilisations"
  ADD CONSTRAINT "immobilisations_immobilisationPrincipaleId_fkey"
  FOREIGN KEY ("immobilisationPrincipaleId") REFERENCES "immobilisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "immobilisations"
  ADD CONSTRAINT "immobilisations_composantRemplaceId_fkey"
  FOREIGN KEY ("composantRemplaceId") REFERENCES "immobilisations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
