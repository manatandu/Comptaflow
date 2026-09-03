-- BASE DES ACOMPTES PROVISIONNELS · CE QUE LA COMPTABILITÉ NE PEUT PAS SAVOIR.
--
-- Article 57 bis de la loi de procédures fiscales n° 004/2003, tel que modifié
-- par la loi de finances n° 25/060 du 29 décembre 2025 : les acomptes « sont
-- calculés sur base de l'impôt déclaré au titre de l'exercice précédent,
-- AUGMENTÉ DES SUPPLÉMENTS ÉVENTUELS ÉTABLIS PAR L'ADMINISTRATION DES IMPÔTS,
-- ou, en cas d'absence de déclaration, de l'impôt reconstitué d'office, QUE CES
-- SOMMES FASSENT OU NON L'OBJET DE CONTESTATION ».
--
-- Le supplément naît d'un avis de redressement, pas d'une écriture : aucun
-- solde de compte ne le porte, et le logiciel ne peut donc que le recevoir.
-- Sans lui, les trois acomptes proposés sont calculés sur l'impôt déclaré seul,
-- donc SOUS-ÉVALUÉS · et un acompte insuffisant est une insuffisance de
-- versement, contestation en cours ou non.
--
-- Défaut à 0 et non NULL : l'absence de supplément est le cas ordinaire, et
-- elle se confond ici avec un supplément nul sans qu'aucune lecture change.
ALTER TABLE "dossiers_fiscaux_exercice"
  ADD COLUMN "supplementsAdministration" DECIMAL(18,2) NOT NULL DEFAULT 0;
