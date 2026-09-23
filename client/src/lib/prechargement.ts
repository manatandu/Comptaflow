import type { Exercice } from './types';

/**
 * LE PRÉCHARGEMENT DES EXERCICES · un aller-retour de moins à chaque ouverture.
 *
 * Au démarrage, trois demandes partaient À LA FILE : `/auth/me`, puis
 * `/exercices` (le contexte d'exercice n'est monté qu'une fois la session
 * confirmée), puis les données de la première fenêtre. Depuis Kinshasa, chaque
 * maillon est un aller-retour vers us-east1. Or `/exercices` ne dépend de rien
 * que `/auth/me` renverrait : le cookie suffit. Il part donc EN MÊME TEMPS, et
 * le contexte d'exercice reprend la réponse au lieu de la redemander.
 *
 * TROIS GARDE-FOUS, parce qu'une réponse périmée serait pire qu'un délai :
 *  · consommée UNE fois, puis oubliée · un rechargement ultérieur interroge le
 *    serveur ;
 *  · valable QUINZE SECONDES · au-delà, elle n'est plus celle du démarrage ;
 *  · oubliée à la déconnexion et à toute session refusée · un autre dossier
 *    ouvert ensuite ne peut pas hériter des exercices du précédent.
 * Un préchargement qui échoue (pas de session, par exemple) n'est jamais une
 * erreur : le contexte refait la demande normalement.
 */
export const VALIDITE_PRECHARGEMENT_MS = 15_000;

let enVol: { promesse: Promise<Exercice[]>; lance: number } | null = null;

export function prechargerExercices(charger: () => Promise<Exercice[]>, maintenant: number = Date.now()): void {
  const promesse = charger();
  // Rattrapée ici · un 401 au démarrage d'une session absente ne doit pas
  // remonter en « promesse rejetée non gérée ».
  promesse.catch(() => undefined);
  enVol = { promesse, lance: maintenant };
}

export function consommerPrechargement(maintenant: number = Date.now()): Promise<Exercice[]> | null {
  const e = enVol;
  enVol = null;
  if (!e || maintenant - e.lance > VALIDITE_PRECHARGEMENT_MS) return null;
  return e.promesse;
}

export function oublierPrechargement(): void {
  enVol = null;
}
