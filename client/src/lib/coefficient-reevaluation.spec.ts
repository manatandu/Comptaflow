import { conversionAffichee, dejaReevalue } from './coefficient-reevaluation';

describe('le coefficient appliqué, montré ligne à ligne (AUDCIF Titre VIII ch. 28 § 4.2.1.1)', () => {
  it('bien jamais réévalué · le coefficient tel quel, aucune base demandée', () => {
    expect(dejaReevalue([])).toBe(false);
    expect(conversionAffichee({ coefficient: 1.5, base: '', anterieurs: [] })).toEqual({ texte: '1,5', manque: false });
  });
  it('Canon du séminaire, 1,17 depuis l’acquisition sur un bien réévalué à 1,03 · la division est montrée', () => {
    expect(conversionAffichee({ coefficient: 1.17, base: 'ORIGINE', anterieurs: [1.03] })).toEqual({
      texte: '1,17 ÷ 1,03 = 1,135922',
      manque: false,
    });
  });
  it('depuis la dernière réévaluation · tel quel ; sans base, le manque est dit', () => {
    expect(conversionAffichee({ coefficient: 1.1, base: 'DERNIERE_REEVALUATION', anterieurs: [1.03] })?.texte).toBe('1,1');
    expect(conversionAffichee({ coefficient: 1.17, base: '', anterieurs: [1.03] })).toEqual({ texte: 'Base du coefficient à déclarer', manque: true });
  });
});
