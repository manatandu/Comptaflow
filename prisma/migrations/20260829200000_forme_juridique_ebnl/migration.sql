-- FORME JURIDIQUE DE L'ENTITÉ (loi n° 004/2001 du 20 juillet 2001)
--
-- L'article 2 de la loi classe l'ASBL en trois natures (association à
-- caractère culturel/social/éducatif/économique, ONG, association
-- confessionnelle) ; le Titre II régit séparément l'établissement d'utilité
-- publique. S'y ajoute l'unité de gestion de projet, que le CPCC vise parmi
-- les entités tenues au SYCEBNL sans qu'elle soit une ASBL.
--
-- Ce n'est pas une donnée d'état civil : elle commande à QUI l'entité rend
-- compte en fin d'exercice. Une ASBL dépose son compte annuel au Ministère
-- de la Justice ; une ONG transmet en plus son rapport d'activité au
-- Ministère du Plan et au ministère de son secteur (art. 44 et 45) ; une ONG
-- étrangère a un accord-cadre à faire vivre (art. 37).
-- Voir docs/obligations-annuelles-ebnl-rdc.md.
--
-- Défaut ASSOCIATION : cas le plus fréquent, et le seul qui ne suppose rien
-- de plus que ce que tout dossier existant a déjà déclaré.
CREATE TYPE "FormeJuridiqueEbnl" AS ENUM (
  'ASSOCIATION',
  'ORGANISATION_NON_GOUVERNEMENTALE',
  'ASSOCIATION_CONFESSIONNELLE',
  'ETABLISSEMENT_UTILITE_PUBLIQUE',
  'UNITE_GESTION_PROJET',
  'AUTRE'
);

ALTER TABLE "tenants" ADD COLUMN "formeJuridique" "FormeJuridiqueEbnl" NOT NULL DEFAULT 'ASSOCIATION';
ALTER TABLE "tenants" ADD COLUMN "droitEtranger" BOOLEAN NOT NULL DEFAULT false;

-- Un dossier tenu en jeu « projets de développement » est, par construction,
-- une unité de gestion de projet : le rattacher évite de faire ressaisir une
-- information que le dossier porte déjà.
UPDATE "tenants" SET "formeJuridique" = 'UNITE_GESTION_PROJET'
  WHERE "referentiel" = 'SYCEBNL' AND "jeuEtatsFinanciersSycebnl" = 'PROJETS_DEVELOPPEMENT';
