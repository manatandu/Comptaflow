import { NumerotationPiece } from '@prisma/client';

/**
 * LES TROUS DANS LA NUMÉROTATION DES PIÈCES, ET LE PIÈGE QUI LES ENTOURE.
 *
 * Un numéro de pièce manquant dans une séquence est ce qu'un réviseur cherche
 * en premier : il veut dire qu'une écriture numérotée a été supprimée, ou
 * qu'un chemin de création a contourné la numérotation. L'AUDCIF art. 17, 3°
 * exige des pièces « classées dans un ordre défini », et le CPCC (§ 3.2) fait
 * de la référence de la pièce le lien entre l'enregistrement et sa
 * justification · une séquence trouée casse ce lien sans qu'aucun total ne
 * bouge.
 *
 * ET C'EST EXACTEMENT LE GENRE DE CONTRÔLE QUI FABRIQUE DES ANOMALIES (§ 10
 * bis). Chercher les trous « par journal, sur l'exercice » est juste pour UN
 * SEUL des quatre modes de numérotation. Appliqué aux trois autres, le même
 * calcul rend un dossier couvert de manques imaginaires, plausibles et
 * sourcés :
 *
 *  · CONTINUE_JOURNAL · la séquence est bien par journal et par exercice. Le
 *    contrôle vaut, et c'est le seul cas où il vaut tel quel.
 *  · CONTINUE_FICHIER · la séquence court sur TOUS LES JOURNAUX du dossier.
 *    Le journal des achats porte 1, 3, 7 et celui des ventes 2, 4, 5 · lus
 *    journal par journal, les deux paraissent troués de partout, alors que la
 *    séquence du dossier est parfaite. Le périmètre est donc le DOSSIER.
 *  · MENSUELLE · la séquence est remise à zéro à chaque mois civil, et l'erreur
 *    n'y va pas dans le sens qu'on croit. Lue sur l'exercice, elle ne fabrique
 *    AUCUN faux trou · elle en MASQUE de vrais, ce qui est pire parce que rien
 *    ne le signale. Janvier porte 1 et 2, février porte 1 et 3 : il manque le 2
 *    de février, et l'union annuelle {1, 2, 3} est parfaitement continue, le 2
 *    de janvier bouchant celui de février. Le périmètre est donc le couple
 *    journal + mois.
 *  · MANUELLE · il n'y a pas de séquence. Le seul résultat honnête est de ne
 *    RIEN dire · inventer un contrôle sur des numéros que personne ne pose
 *    reprocherait au cabinet une discipline qu'il n'a pas choisie.
 *
 * D'où cette fonction, qui répond à une seule question : sur quel PÉRIMÈTRE la
 * séquence de ce journal est-elle continue. Le reste du calcul en découle.
 */

/** Le périmètre sur lequel une séquence de numéros est censée être continue. */
export type PerimetreSequence = 'JOURNAL_EXERCICE' | 'DOSSIER_EXERCICE' | 'JOURNAL_MOIS' | 'AUCUN';

export function perimetreDeLaSequence(numerotation: NumerotationPiece): PerimetreSequence {
  switch (numerotation) {
    case NumerotationPiece.CONTINUE_JOURNAL:
      return 'JOURNAL_EXERCICE';
    case NumerotationPiece.CONTINUE_FICHIER:
      return 'DOSSIER_EXERCICE';
    case NumerotationPiece.MENSUELLE:
      return 'JOURNAL_MOIS';
    case NumerotationPiece.MANUELLE:
      return 'AUCUN';
  }
}

/** Ce que l'état affiche à côté du décompte, pour que personne ne le lise de travers. */
export const EXPLICATION_PERIMETRE: Record<PerimetreSequence, string> = {
  JOURNAL_EXERCICE:
    "Numérotation continue par journal : la séquence est vérifiée sur ce journal, pour l'exercice entier.",
  DOSSIER_EXERCICE:
    "Numérotation continue sur le fichier : la séquence court sur TOUS les journaux du dossier. Elle n'est donc pas vérifiable journal par journal, et le contrôle porte sur le dossier · voir la ligne de synthèse.",
  JOURNAL_MOIS:
    "Numérotation mensuelle : la séquence repart de 1 chaque mois civil. Les trous sont cherchés mois par mois · lus sur l'exercice entier, les numéros d'un mois boucheraient les manques d'un autre et le contrôle se tairait à tort.",
  AUCUN:
    "Numérotation manuelle : aucune séquence n'est imposée par le journal, il n'y a donc aucun trou à chercher. Le logiciel ne se prononce pas.",
};

/**
 * Les numéros MANQUANTS d'une séquence, entre son minimum et son maximum
 * observés. Rendus par intervalles, parce qu'une suppression en porte
 * rarement un seul et qu'une liste de deux cents numéros ne se lit pas.
 *
 * LA SÉQUENCE N'EST JAMAIS SUPPOSÉE COMMENCER À 1. Un dossier repris en cours
 * d'année reprend la numérotation là où le logiciel précédent l'a laissée ;
 * exiger 1 signalerait à chaque reprise un manque de tout ce qui précède
 * l'entrée dans OmegaX, c'est-à-dire un reproche adressé au mauvais logiciel.
 */
export function trousDeLaSequence(numeros: number[]): Array<{ de: number; a: number }> {
  const tries = [...new Set(numeros)].sort((a, b) => a - b);
  const trous: Array<{ de: number; a: number }> = [];
  for (let i = 1; i < tries.length; i++) {
    if (tries[i] === tries[i - 1] + 1) continue;
    trous.push({ de: tries[i - 1] + 1, a: tries[i] - 1 });
  }
  return trous;
}

/** Combien de numéros manquent en tout · un intervalle peut en porter plusieurs. */
export function compterManquants(trous: Array<{ de: number; a: number }>): number {
  return trous.reduce((t, i) => t + (i.a - i.de + 1), 0);
}
