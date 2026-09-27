import { indicateursTableauDeBord } from './indicateurs-tableau-de-bord';
import type { LigneBalance } from './types';

const ligne = (numero: string, solde: number, cloture: { debit?: number; credit?: number } = {}): LigneBalance =>
  ({
    compteId: numero,
    numero,
    intitule: numero,
    classe: `CLASSE_${numero[0]}`,
    typeCompte: 'DETAIL',
    reportDebit: 0,
    reportCredit: 0,
    mouvementDebit: 0,
    mouvementCredit: 0,
    clotureDebit: cloture.debit,
    clotureCredit: cloture.credit,
    totalDebit: 0,
    totalCredit: 0,
    solde,
  }) as LigneBalance;

describe('indicateurs du tableau de bord (audit final F93)', () => {
  it('sur un exercice CLÔTURÉ, rend l’activité de l’exercice et non les soldes remis à zéro', () => {
    // Ventes 1 000, achats 600 · la clôture solde les deux : solde nul, et la
    // colonne de clôture porte l'inverse de l'activité.
    const r = indicateursTableauDeBord([
      ligne('70110000', 0, { debit: 1000 }),
      ligne('60110000', 0, { credit: 600 }),
      ligne('52110000', 400),
    ]);
    expect(r).toEqual({ tresorerie: 400, produits: 1000, charges: 600, resultat: 400 });
  });

  it('sur un exercice ouvert, lit les soldes', () => {
    const r = indicateursTableauDeBord([ligne('70110000', -1000), ligne('60110000', 600), ligne('59000000', -50)]);
    expect(r).toEqual({ tresorerie: 0, produits: 1000, charges: 600, resultat: 400 });
  });
});
