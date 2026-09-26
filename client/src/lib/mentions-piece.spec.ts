import { avertissementArticle17, PIECE_ANTERIEURE } from './mentions-piece';

describe('AUSCGIE art. 17 sur la pièce imprimée', () => {
  it('une pièce complète ne signale rien', () => {
    expect(avertissementArticle17({ denomination: 'X', ligne: 'SARL · au capital de 1 000 000 CDF', manquantes: [] }, true)).toBeNull();
  });

  it('ce qui manquait À L’ÉTABLISSEMENT est dit, jamais comblé par le dossier d’aujourd’hui', () => {
    const a = avertissementArticle17({ denomination: 'X', ligne: 'SARL', manquantes: ['montant du capital social'] }, true);
    expect(a).toContain('montant du capital social');
  });

  it('hors des sociétés commerciales, rien n’est reproché', () => {
    // Une ASBL, une personne physique · la ligne est nulle, l'art. 17 ne les vise pas.
    expect(avertissementArticle17({ denomination: 'X', ligne: null, manquantes: [] }, false)).toBeNull();
  });

  it('une pièce antérieure à la recopie le DIT, chez une société seulement', () => {
    expect(avertissementArticle17(null, true)).toBe(PIECE_ANTERIEURE);
    expect(avertissementArticle17(null, false)).toBeNull();
  });
});
