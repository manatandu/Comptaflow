-- LES DEUX SEULES EXCEPTIONS À LA CORRESPONDANCE BILAN DE CLÔTURE /
-- BILAN D'OUVERTURE.
--
-- La convention est écrite des deux côtés, chacun dans son texte : « le bilan
-- d'ouverture d'un exercice doit correspondre au bilan de clôture de l'exercice
-- précédent » (AUDCIF art. 34 et Titre V ; SYCEBNL art. 16, 4) et cadre
-- conceptuel § 3.3.1.2.4). Sa conséquence, que les deux textes énoncent dans
-- les mêmes termes : on ne peut PAS imputer directement sur les capitaux
-- propres les incidences d'un changement de méthode, ni les charges et produits
-- d'exercices antérieurs omis · ils transitent par le compte de résultat du
-- nouvel exercice.
--
-- DEUX EXCEPTIONS, ET DEUX SEULEMENT :
--  1. l'incidence d'un CHANGEMENT DE MÉTHODE à impact fort significatif, dont
--     « l'impact déterminé à l'ouverture est imputé en report à nouveau dès
--     l'ouverture de l'exercice » ;
--  2. la correction d'une ERREUR SIGNIFICATIVE d'un exercice antérieur, « opérée
--     par ajustement des capitaux propres d'ouverture ».
--
-- CE QUE RIEN NE VOYAIT. Le logiciel refusait déjà de laisser modifier une
-- écriture de clôture, et son message citait la convention. Mais rien
-- n'empêchait de mouvementer le compte 12 par une écriture ORDINAIRE : la
-- correspondance se rompait alors sans qu'aucun total ne bouge, et l'écriture
-- était indiscernable d'une erreur d'imputation. Ces deux colonnes la déclarent
-- pour ce qu'elle est, et la justification porte la mention que les deux textes
-- exigent en Notes annexes.
--
-- NULLABLES · toute écriture ordinaire les laisse vides, et c'est le cas
-- immense majoritaire. Les rendre obligatoires ferait de l'exception la règle.
CREATE TYPE "MotifImputationOuverture" AS ENUM (
  'CHANGEMENT_METHODE',
  'CORRECTION_ERREUR_SIGNIFICATIVE'
);

ALTER TABLE "ecritures"
  ADD COLUMN "motifImputationOuverture"        "MotifImputationOuverture",
  ADD COLUMN "justificationImputationOuverture" TEXT;
