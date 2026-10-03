import { montant as nombre } from './montants';

/**
 * Les messages de l'écran de l'écriture de l'impôt (ligne A11), hors du
 * composant pour se tester sans monter l'écran.
 */

export interface AnnulationImpot {
  traitement: 'SANS_ECRITURE' | 'SUPPRIMEE' | 'INSCRITE_EN_NEGATIF';
  numeroPiece?: number | null;
  negatifNumeroPiece?: number | null;
}

/** Le compte rendu d'une annulation, d'après le traitement que le serveur a appliqué. */
export function messageAnnulation(r: AnnulationImpot): string {
  if (r.traitement === 'SUPPRIMEE') return `Annulé · la pièce n° ${r.numeroPiece ?? '·'} était au brouillard, elle est supprimée.`;
  if (r.traitement === 'INSCRITE_EN_NEGATIF') {
    return `Annulé · la pièce n° ${r.numeroPiece ?? '·'} était validée, elle est inscrite en négatif (pièce n° ${r.negatifNumeroPiece ?? '·'}).`;
  }
  return 'Annulé · aucune écriture n’était rattachée au constat.';
}

/** L'écart entre l'impôt recalculé et le montant passé, en valeur absolue et dans son sens. */
export function messageEcart(impotRecalcule: number, ecart: number): string {
  const sens = ecart > 0 ? 'supérieur' : 'inférieur';
  return `L’impôt recalculé (${nombre(impotRecalcule)}) est ${sens} de ${nombre(Math.abs(ecart))} au montant passé.`;
}
