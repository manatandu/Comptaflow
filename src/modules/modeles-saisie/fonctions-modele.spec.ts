import { motifRefusFonctions } from './fonctions-modele';

describe('fonctions de ligne d’un modèle (Sage i7)', () => {
  it('le modèle du manuel · Saisir, Calculer (TVA), Équilibrer', () => {
    expect(
      motifRefusFonctions([{ fonction: 'SAISIR' }, { fonction: 'CALCULER', tauxTvaId: 't' }, { fonction: 'EQUILIBRER' }]),
    ).toBeNull();
  });
  it('Répéter et Calculer ne se posent pas en première ligne', () => {
    expect(motifRefusFonctions([{ fonction: 'REPETER' }, { fonction: 'EQUILIBRER' }])).toMatch(/première ligne/);
    expect(motifRefusFonctions([{ fonction: 'CALCULER', tauxTvaId: 't' }, { fonction: 'SAISIR' }])).toMatch(/première ligne/);
  });
  it('Calculer demande son taux, et un taux ne sert qu’à Calculer', () => {
    expect(motifRefusFonctions([{ fonction: 'SAISIR' }, { fonction: 'CALCULER' }])).toMatch(/taux de taxe à appliquer/);
    expect(motifRefusFonctions([{ fonction: 'SAISIR', tauxTvaId: 't' }, { fonction: 'EQUILIBRER' }])).toMatch(/ne sert qu'à une ligne « Calculer »/);
  });
  it('une seule ligne équilibre, et un montant figé ne vaut que pour Saisir', () => {
    expect(motifRefusFonctions([{ fonction: 'EQUILIBRER' }, { fonction: 'EQUILIBRER' }])).toMatch(/Une seule ligne/);
    expect(motifRefusFonctions([{ fonction: 'SAISIR' }, { fonction: 'EQUILIBRER', montant: 10 }])).toMatch(/montant figé/);
    expect(motifRefusFonctions([{ montant: 10 }, { fonction: 'EQUILIBRER' }])).toBeNull();
  });
});
