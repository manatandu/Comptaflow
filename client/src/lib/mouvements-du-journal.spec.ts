import { mouvementsDuJournal } from './mouvements-du-journal';

describe('mouvements du journal · balance à six colonnes', () => {
  it('garde ouverture + mouvements = clôture sur une charge d’exercice clos (audit final F5)', () => {
    const charge = {
      reportDebit: 0,
      reportCredit: 0,
      mouvementDebit: 3000,
      mouvementCredit: 0,
      clotureDebit: 0,
      clotureCredit: 3000,
      solde: 0,
    };
    const m = mouvementsDuJournal(charge);
    expect(charge.reportDebit - charge.reportCredit + m.debit - m.credit).toBe(charge.solde);
  });

  it('lit une ligne sans colonnes de clôture comme ses seuls mouvements', () => {
    expect(mouvementsDuJournal({ mouvementDebit: 400, mouvementCredit: 100 })).toEqual({ debit: 400, credit: 100 });
  });
});
