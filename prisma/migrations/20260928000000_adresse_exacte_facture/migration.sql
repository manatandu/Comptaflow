-- L'ADRESSE EXACTE, mention obligatoire que le module ne vérifiait pas.
--
-- Décret n° 23/10 du 3 mars 2023, art. 26 a) et b) : « les nom, post-nom et
-- prénom ou raison sociale, L'ADRESSE EXACTE, le numéro impôt du vendeur ou
-- prestataire » et « les nom, post-nom et prénom ou raison sociale, L'ADRESSE
-- EXACTE du client et son numéro impôt ».
--
-- Le module avait été bâti sur l'art. 100 du décret n° 011/42 de 2011, qui
-- n'écrit que « identité et n° impôt ». Ce n'était pas un champ de moins :
-- `verifierMentions` rendait « conforme » une pièce qui omet une mention
-- obligatoire, et l'écran l'affichait ainsi, sans amende, alors que l'art. 97
-- bis en punit chaque omission. Trouvé par la passe F1 du plan de
-- confrontations.
--
-- NULLABLE · les factures déjà saisies n'ont pas d'adresse, et c'est l'état
-- vrai. La mention leur manque, et le module le dira, sauf si leur date est
-- antérieure au 3 mars 2023 : le décret « entre en vigueur à la date de sa
-- signature » (art. 29) et ne leur est pas opposable.

-- AlterTable
ALTER TABLE "factures" ADD COLUMN     "contrepartieAdresse" TEXT,
ADD COLUMN     "emetteurAdresse" TEXT;
