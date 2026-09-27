import type { LigneBalance } from './types';

/**
 * LES QUATRE INDICATEURS DU TABLEAU DE BORD, lus sur la balance de
 * l'exercice.
 *
 * LES COMPTES DE GESTION SE LISENT HORS CLÔTURE (audit final F93) · sur un
 * exercice clôturé, l'écriture qui solde les classes 6 à 8 remet leur solde à
 * zéro, et le tableau de bord affichait des produits, des charges et un
 * résultat nuls. L'activité de l'exercice est le solde MOINS la colonne de
 * clôture ; la trésorerie, compte de bilan, garde son solde.
 */
export function indicateursTableauDeBord(balance: LigneBalance[]) {
  let tresorerie = 0;
  let produits = 0;
  let charges = 0;
  let resultat = 0;
  for (const l of balance) {
    if (l.typeCompte === 'TOTAL') continue;
    const c = l.numero[0];
    const horsCloture = l.solde - ((l.clotureDebit ?? 0) - (l.clotureCredit ?? 0));
    if (c === '5' && !l.numero.startsWith('59')) tresorerie += l.solde;
    if (c === '7') produits -= horsCloture;
    if (c === '6') charges += horsCloture;
    if (c === '6' || c === '7' || c === '8') resultat -= horsCloture;
  }
  return { tresorerie, produits, charges, resultat };
}
