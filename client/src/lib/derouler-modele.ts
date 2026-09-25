import { arrondi2, montantTva } from './tva-saisie';
import type { TauxTva } from './types';

/**
 * DÉROULER UN MODÈLE DE SAISIE · les fonctions de ligne de Sage i7 (manuel de
 * formation, « Modèles de saisie »), dans l'ordre où elles se calculent :
 *
 *  · SAISIR · le montant figé du modèle, ou celui que l'utilisateur donne à
 *    l'appel ;
 *  · RÉPÉTER · « la même valeur que celle mentionnée sur la ligne précédente
 *    dans la même colonne » ;
 *  · CALCULER · la taxe de la ligne précédente au taux de la ligne (« ex :
 *    calcul de TVA automatiquement »). Le taux est PORTÉ par la ligne de taxe
 *    produite, jamais par la ligne de base · c'est lui que la déclaration lit ;
 *  · ÉQUILIBRER · « par équilibrage avec les autres montants saisis en débit
 *    et crédit », calculé EN DERNIER, puisqu'il dépend de tous les autres.
 *
 * Un équilibrage qui tomberait dans le sens opposé à celui de sa ligne n'est
 * pas retourné en silence · il est rendu à zéro avec un motif, la pièce reste
 * déséquilibrée et le dit.
 */
export type FonctionLigne = 'SAISIR' | 'REPETER' | 'CALCULER' | 'EQUILIBRER';

export interface LigneDeModele {
  ordre: number;
  compteId: string;
  compteNumero: string;
  compteIntitule: string;
  sens: 'DEBIT' | 'CREDIT';
  libelle: string | null;
  montant: number | null;
  fonction?: FonctionLigne;
  tauxTvaId?: string | null;
}

export interface LigneDeroulee {
  compteId: string;
  numero: string;
  intitule: string;
  libelle: string;
  debit: number;
  credit: number;
  tauxTvaId?: string;
}

/** Les lignes dont le montant se demande à l'appel · SAISIR sans montant figé. */
export function lignesASaisir(lignes: LigneDeModele[]): LigneDeModele[] {
  return lignes.filter((l) => (l.fonction ?? 'SAISIR') === 'SAISIR' && l.montant === null);
}

export function deroulerModele(
  lignes: LigneDeModele[],
  saisies: Record<number, number>,
  taux: TauxTva[],
): { lignes: LigneDeroulee[]; motif: string | null } {
  const ordonnees = [...lignes].sort((a, b) => a.ordre - b.ordre);
  const montants: number[] = [];
  let motif: string | null = null;
  ordonnees.forEach((l, i) => {
    const f = l.fonction ?? 'SAISIR';
    if (f === 'SAISIR') montants[i] = l.montant ?? saisies[l.ordre] ?? 0;
    else if (f === 'REPETER') montants[i] = montants[i - 1] ?? 0;
    else if (f === 'CALCULER') {
      const t = taux.find((x) => x.id === l.tauxTvaId);
      if (!t) {
        motif = `Le taux de la ligne ${i + 1} est introuvable ou inactif · la taxe n'est pas calculée.`;
        montants[i] = 0;
      } else montants[i] = montantTva(montants[i - 1] ?? 0, t);
    } else montants[i] = 0;
  });
  const iEq = ordonnees.findIndex((l) => l.fonction === 'EQUILIBRER');
  if (iEq >= 0) {
    let solde = 0;
    ordonnees.forEach((l, i) => {
      if (i !== iEq) solde += l.sens === 'DEBIT' ? montants[i] : -montants[i];
    });
    const attendu = ordonnees[iEq].sens === 'CREDIT' ? solde : -solde;
    if (attendu < 0) {
      motif = `La ligne « Équilibrer » (${ordonnees[iEq].compteNumero}) tomberait dans le sens opposé au sien · elle est laissée à zéro.`;
      montants[iEq] = 0;
    } else montants[iEq] = arrondi2(attendu);
  }
  return {
    motif,
    lignes: ordonnees.map((l, i) => ({
      compteId: l.compteId,
      numero: l.compteNumero,
      intitule: l.compteIntitule,
      libelle: l.libelle ?? '',
      debit: l.sens === 'DEBIT' ? montants[i] : 0,
      credit: l.sens === 'CREDIT' ? montants[i] : 0,
      ...(l.fonction === 'CALCULER' && l.tauxTvaId ? { tauxTvaId: l.tauxTvaId } : {}),
    })),
  };
}
