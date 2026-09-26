import { ecrireVariations, lireVariations } from './simulations-budgetaires';

describe('lecture des taux par ligne du simulateur', () => {
  it('lit « racine = taux », virgule décimale et taux négatif compris', () => {
    expect(lireVariations('66 = 5 ; 62=-2,5\n70 = 10')).toEqual({ variations: { '66': 5, '62': -2.5, '70': 10 } });
  });

  it('une saisie vide ne pose aucun taux', () => {
    expect(lireVariations('  ')).toEqual({ variations: {} });
  });

  it('une entrée illisible est RENDUE comme motif, jamais ignorée', () => {
    // Ignorée, la ligne garderait son taux par défaut sans que personne ne le sache.
    const r = lireVariations('66 = 5 ; 601 = 3');
    expect(r).toEqual({ motif: expect.stringContaining('« 601 = 3 »') });
  });

  it('écrire puis relire rend les mêmes taux', () => {
    const v = { '70': 12.5, '66': -3 };
    expect(lireVariations(ecrireVariations(v))).toEqual({ variations: v });
  });
});
