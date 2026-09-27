import type { LigneBalance } from './types';

/**
 * Les mouvements du JOURNAL de l'exercice, écriture de solde des classes 6 à
 * 8 comprise (audit final F5) · c'est ce qui garde « ouverture + mouvements =
 * clôture » vrai ligne à ligne sur un exercice clos, sans que cette écriture
 * soit jamais prise pour une ouverture.
 */
export function mouvementsDuJournal(l: Pick<LigneBalance, 'mouvementDebit' | 'mouvementCredit' | 'clotureDebit' | 'clotureCredit'>) {
  return { debit: l.mouvementDebit + (l.clotureDebit ?? 0), credit: l.mouvementCredit + (l.clotureCredit ?? 0) };
}
