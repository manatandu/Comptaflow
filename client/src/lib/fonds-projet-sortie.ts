/**
 * LE FONDS QUI REPREND UN BIEN DE PROJET · SYCEBNL Partie 3 ch. 3 § 2.5.
 *
 * La liste vient du serveur (`GET /immobilisations/comptes-fonds-projet`),
 * filtrée par la même racine que le refus de la sortie · l'écran ne
 * recompose plus « 162, 163, 164 » de son côté. Ce module ne garde que ce
 * que l'écran décide · quel compte présélectionner, et quoi dire quand il
 * n'y a rien à choisir (§ 9 ter du règlement).
 */

export interface CompteFondsProjet {
  id: string;
  numero: string;
  intitule: string;
}

export interface ReponseFondsProjet {
  projet: boolean;
  comptes: CompteFondsProjet[];
  /** Comptes de fonds du plan mis en sommeil, écartés de la liste · le dire, jamais les taire. */
  enSommeil: number;
  /** Pourquoi la liste est vide et ce qu'il faut faire d'abord ; null quand elle ne l'est pas. */
  motifVide: string | null;
}

/**
 * Un choix unique se présélectionne, et lui seul · qui a financé le bien
 * n'est écrit nulle part sur la fiche, et un solde de l'exercice (sans
 * l'à-nouveau d'un exercice précédent non clôturé) désignait le mauvais
 * fonds · présélectionner parmi plusieurs serait deviner.
 */
export function fondsPreselectionne(comptes: CompteFondsProjet[]): string | null {
  return comptes.length === 1 ? comptes[0].id : null;
}

/**
 * Ce que l'écran dit sous le choix. `null` en entrée, c'est une liste NON LUE
 * (chargement ou échec) · jamais « aucun compte », qui serait une réponse.
 */
export function messageFondsProjet(reponse: ReponseFondsProjet | null, erreur: string | null): string | null {
  if (erreur) return `Comptes de fonds illisibles · ${erreur}`;
  if (!reponse) return 'Lecture des comptes de fonds…';
  if (reponse.comptes.length === 0) return reponse.motifVide ?? 'Aucun compte de fonds affecté proposé.';
  if (reponse.enSommeil > 0) return `${reponse.enSommeil} compte(s) de fonds en sommeil non proposé(s) · réactivez-le dans Plan comptable s'il a financé le bien.`;
  return null;
}
