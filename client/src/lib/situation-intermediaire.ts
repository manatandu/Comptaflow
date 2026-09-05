/**
 * LES DEUX MENTIONS D'UNE SITUATION INTERMÉDIAIRE · AUDCIF, Titre VIII ch. 39.
 *
 * Elles sont recopiées du serveur (`src/modules/etats-financiers/
 * situation-intermediaire.ts`) plutôt qu'appelées : ce sont des textes fixes,
 * et une requête de plus pour deux phrases qui ne dépendent d'aucun dossier
 * serait un aller-retour pour rien. Le spec vérifie qu'elles n'ont pas
 * divergé · deux rédactions pour une même déclaration réglementaire, c'est
 * une des deux qui devient fausse le jour où l'autre est corrigée.
 */

/** § 2.1.1, premier tiret. */
export const DECLARATION_METHODES_IDENTIQUES =
  'Les méthodes comptables et les modalités de calcul adoptées sont identiques à celles utilisées dans les ' +
  "comptes de l'exercice les plus récents (AUDCIF, Titre VIII ch. 39 § 2.1.1). Si elles ont changé, la nature de " +
  'ces changements et leur incidence doivent être décrites, et l’information comparative retraitée pro-forma.';

/** Ce que la situation n'est PAS · les mentions du § 2.1.1 qu'aucun solde ne porte. */
export const RESERVE_JEU_INCOMPLET =
  'Situation intermédiaire · elle n’est pas un jeu complet de comptes intermédiaires au sens du ch. 39 : les ' +
  'mentions du § 2.1.1 qui ne se déduisent d’aucun solde (éléments exceptionnels, changements d’estimation, ' +
  'transactions avec les parties liées, caractère saisonnier de l’activité) restent à rédiger.';
