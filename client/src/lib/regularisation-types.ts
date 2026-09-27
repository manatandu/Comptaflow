import type { Exercice, TypeRegularisation } from './types';

/**
 * LES CINQ RÉGULARISATIONS À L'ÉCRAN (audit final F67). Le serveur servait la
 * charge à payer et le produit à recevoir, l'écran n'en connaissait que trois
 * et n'envoyait jamais la nature du tiers · le rattachement décrit comme
 * livré ne s'accomplissait pas.
 *
 * La nature du tiers décide du compte de rattachement, que le SERVEUR résout
 * (`RegularisationService.compteRattachement`) · l'écran ne propose que les
 * natures que la table du serveur ouvre pour le type, et un spec les relit
 * dans sa source. Une charge à payer sur un client est une dette envers un
 * client (419), un produit à recevoir sur un fournisseur une créance sur
 * fournisseur (409) · aucune des deux n'est offerte.
 */

export type NatureTiers = 'FOURNISSEURS' | 'CLIENTS' | 'PERSONNEL' | 'ORGANISMES_SOCIAUX' | 'ETAT';

export const LIBELLE_NATURE_TIERS: Record<NatureTiers, string> = {
  FOURNISSEURS: 'Fournisseurs',
  CLIENTS: 'Clients, adhérents et usagers',
  PERSONNEL: 'Personnel',
  ORGANISMES_SOCIAUX: 'Organismes sociaux',
  ETAT: 'État et collectivités publiques',
};

export function estRattachement(type: TypeRegularisation): boolean {
  return type === 'CHARGE_A_PAYER' || type === 'PRODUIT_A_RECEVOIR';
}

/** Le compte de gestion porte une charge (classe 6) ou un produit (classe 7). */
export function porteUneCharge(type: TypeRegularisation): boolean {
  return type === 'CHARGE_CONSTATEE_AVANCE' || type === 'CHARGE_A_PAYER';
}

export function naturesTiersProposees(type: TypeRegularisation): NatureTiers[] {
  if (type === 'CHARGE_A_PAYER') return ['FOURNISSEURS', 'PERSONNEL', 'ORGANISMES_SOCIAUX', 'ETAT'];
  if (type === 'PRODUIT_A_RECEVOIR') return ['CLIENTS', 'PERSONNEL', 'ORGANISMES_SOCIAUX', 'ETAT'];
  return [];
}

/**
 * LES EXERCICES OÙ UNE RÉGULARISATION SE REPREND · ouverts et POSTÉRIEURS à
 * celui de la constatation (audit final F79), la règle que le serveur oppose
 * (`RegularisationService.exercicePosterieur`). La liste proposait tout autre
 * exercice ouvert, antérieur compris.
 */
export function exercicesDeReprise<E extends Pick<Exercice, 'id' | 'dateDebut' | 'statut'>>(
  exercices: E[],
  exerciceConstatationId: string,
): E[] {
  const constatation = exercices.find((e) => e.id === exerciceConstatationId);
  if (!constatation) return [];
  const debut = new Date(constatation.dateDebut).getTime();
  return exercices.filter((e) => e.statut === 'OUVERT' && new Date(e.dateDebut).getTime() > debut);
}
