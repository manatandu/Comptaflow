import { compte29EnPlace } from './depreciation-en-cours';

/*
  Ligne A22 · le compte 29 présélectionné est celui qui porte la dépréciation
  en place, le seul que le serveur admet ensuite (le 29x9 d'un bien achevé
  compris, faute de texte qui le vire).
*/
describe('compte 29 de la dépréciation en place', () => {
  it('le 2939 doté pendant les travaux reste présélectionné après la mise en service', () => {
    expect(compte29EnPlace([{ sens: 'DOTATION', montant: 400_000, compteDepreciationId: 'c2939' }])).toBe('c2939');
  });

  it('une dépréciation reprise en entier ne présélectionne plus rien', () => {
    expect(
      compte29EnPlace([
        { sens: 'DOTATION', montant: 400_000, compteDepreciationId: 'c2939' },
        { sens: 'REPRISE', montant: 400_000, compteDepreciationId: 'c2939' },
      ]),
    ).toBeNull();
  });

  it('deux comptes qui portent un reste · le cabinet choisit, rien n’est deviné', () => {
    expect(
      compte29EnPlace([
        { sens: 'DOTATION', montant: 400_000, compteDepreciationId: 'c2939' },
        { sens: 'DOTATION', montant: 100_000, compteDepreciationId: 'c2931' },
      ]),
    ).toBeNull();
  });

  it('un mouvement qui ne dit pas son compte (serveur d’avant) ne fait rien présélectionner', () => {
    expect(compte29EnPlace([{ sens: 'DOTATION', montant: 400_000 }])).toBeNull();
  });
});
