-- Forme juridique d'un dossier SYSCOHADA.
--
-- Le dossier ne disposait que de FormeJuridiqueEbnl, tirée de la loi
-- congolaise n° 004/2001 sur les ASBL, et l'ecran la servait aussi aux
-- dossiers SYSCOHADA, qui relevent du droit OHADA des affaires.
--
-- Colonne NULLABLE et SANS defaut : la forme se lit dans les statuts. Une
-- valeur par defaut produirait des jalons de cloture faux sur tous les
-- dossiers existants.
CREATE TYPE "FormeJuridiqueSyscohada" AS ENUM (
  'SOCIETE_ANONYME',
  'SOCIETE_PAR_ACTIONS_SIMPLIFIEE',
  'SOCIETE_RESPONSABILITE_LIMITEE',
  'SOCIETE_NOM_COLLECTIF',
  'SOCIETE_COMMANDITE_SIMPLE',
  'GROUPEMENT_INTERET_ECONOMIQUE',
  'SOCIETE_COOPERATIVE',
  'ENTREPRISE_INDIVIDUELLE',
  'ENTREPRENANT',
  'SUCCURSALE',
  'ENTITE_PUBLIQUE',
  'AUTRE'
);

ALTER TABLE "tenants" ADD COLUMN "formeJuridiqueSyscohada" "FormeJuridiqueSyscohada";
