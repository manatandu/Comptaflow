/**
 * L'ORDRE DE PRÉSENTATION D'UNE ÉCRITURE · les débits, puis les crédits, et
 * dans chaque colonne la nature avant ses accessoires.
 *
 * CE QUI SE PASSAIT AVANT. Les modèles de saisie écrits à la main
 * construisaient leurs lignes dans l'ordre où le code les tapait, pas dans
 * l'ordre où un comptable les lit. Pour un achat, la trésorerie arrivait en
 * PREMIÈRE ligne, au crédit, suivie de la charge au débit, puis de la TVA :
 * une écriture qui commence par son crédit, et qu'aucun manuel ne présente
 * ainsi.
 *
 * LA RÈGLE N'EST PAS UNE PRÉFÉRENCE, ELLE EST DANS LE GUIDE. Le Guide
 * d'application du SYSCOHADA révisé présente CHAQUE écriture en tableau à cinq
 * colonnes, « Débit (compte débité) | Crédit (compte crédité) | Date et
 * libellé | Montant débit | Montant crédit », et remplit toujours les lignes
 * débitées avant les lignes créditées.
 *
 * Deux écritures du guide suffisent à fixer l'ordre INTERNE à chaque colonne.
 *
 *  · Application 1, acquisition de matériels et fournitures · au débit
 *    2443.26 (immobilisation), 6011.26, 6015.26, 6011.17, 6055.17, 6015.17
 *    (charges), PUIS 4451 et 4452 (TVA récupérable) ; au crédit 4812 et 4011
 *    (fournisseurs). La TVA vient APRÈS les comptes de nature, jamais avant,
 *    alors que son numéro la placerait en tête d'un tri numérique nu.
 *  · Application 2, ventes · au débit 4111 (client) ; au crédit 7011, 7021,
 *    7011, 7071 (produits) PUIS 4431 (TVA facturée). Même place pour la taxe.
 *
 * L'escompte, lui, est un accessoire du règlement : le compte 40 se débite
 * « des escomptes de règlement obtenus des fournisseurs ; par le crédit du
 * compte 773 Escomptes obtenus » (SYCEBNL, fonctionnement du compte 40 ·
 * SYSCOHADA, Partie 1 ch. 4). Il se lit donc après le tiers qu'il solde, et
 * c'est la place que lui donne ce module.
 *
 * CE QUE CE MODULE NE FAIT PAS. Il ne touche NI aux écritures-types SYCEBNL
 * servies par `/operations-specifiques`, qui sont transcrites du Guide
 * d'application dans SON ordre et qu'un tri générique dégraderait, NI aux
 * modèles de saisie propres au dossier, dont le champ `ordre` porte un choix
 * que le cabinet a fait lui-même. Il ordonne ce qu'OMEGAX propose de son
 * propre chef, et rien d'autre.
 */

/** Rang d'une ligne DANS SA COLONNE · plus petit veut dire plus haut. */
const NATURE = 0;
const TAXE = 1;
const ESCOMPTE = 2;

/**
 * Comptes de taxe sur le chiffre d'affaires · 443 TVA facturée, 444 TVA due ou
 * crédit de TVA, 445 TVA récupérable, 446 autres taxes sur le chiffre
 * d'affaires. Les deux plans semés portent ces quatre racines (voir
 * `compte-seed-syscohada.ts` et `compte-seed.ts`).
 *
 * VOLONTAIREMENT PAS « 44 » · la racine entière emporterait le 441 Impôt sur
 * le résultat et le 447 Impôts retenus à la source, qui ne sont pas des
 * accessoires d'une facture et n'ont aucune raison de passer après une charge.
 */
const RACINES_TAXE = ['443', '444', '445', '446'];

/** 673 Escomptes accordés, 773 Escomptes obtenus · les deux plans les portent. */
const RACINES_ESCOMPTE = ['673', '773'];

function rang(numero: string): number {
  if (RACINES_ESCOMPTE.some((r) => numero.startsWith(r))) return ESCOMPTE;
  if (RACINES_TAXE.some((r) => numero.startsWith(r))) return TAXE;
  return NATURE;
}

/** Ce qu'il faut d'une ligne pour l'ordonner · rien de plus. */
export interface LigneOrdonnable {
  numero: string;
  debit: number;
  credit: number;
}

/**
 * Ordonne les lignes d'une écriture PROPOSÉE.
 *
 * Trois clés, dans cet ordre : le SENS (débit avant crédit), le RANG dans la
 * colonne (nature, puis taxe, puis escompte), et enfin le NUMÉRO de compte,
 * croissant. Le tri est stable, donc deux lignes qui partagent les trois clés
 * gardent l'ordre où le modèle les a écrites.
 *
 * UNE LIGNE À DEUX ZÉROS EST UN DÉBIT · un modèle peut proposer une ligne sans
 * montant, que le comptable chiffre ensuite. La ranger au crédit au seul motif
 * qu'elle ne porte pas de débit inverserait la moitié d'un modèle vierge.
 */
export function ordonnerLignes<T extends LigneOrdonnable>(lignes: T[]): T[] {
  return lignes
    .map((l, i) => ({ l, i }))
    .sort((a, b) => {
      const sensA = a.l.credit > 0 && a.l.debit === 0 ? 1 : 0;
      const sensB = b.l.credit > 0 && b.l.debit === 0 ? 1 : 0;
      if (sensA !== sensB) return sensA - sensB;
      const rangA = rang(a.l.numero);
      const rangB = rang(b.l.numero);
      if (rangA !== rangB) return rangA - rangB;
      if (a.l.numero !== b.l.numero) return a.l.numero < b.l.numero ? -1 : 1;
      return a.i - b.i;
    })
    .map((x) => x.l);
}
