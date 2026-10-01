import { motifRefusRepriseDepreciation, plafondRepriseDepreciation } from './plafond-reprise-depreciation';

/**
 * LOT 12 · la règle pure du plafond (AUDCIF Titre VIII ch. 12 § 2.4.2). Le
 * rejeu du plan d'origine est éprouvé dans `depreciation-immobilisation.spec.ts`
 * sur l'exemple chiffré du texte.
 */
describe('le plafond de reprise · le plus bas de deux bornes', () => {
  const texte = { cumulDepreciation: 4_000_000, valeurNette: 15_000_000, valeurSansDepreciation: 18_000_000 };

  it('l’écart avec la valeur sans dépréciation, quand il est sous le cumul du 29', () => {
    expect(plafondRepriseDepreciation(texte)).toBe(3_000_000);
  });

  it('le cumul du 29, quand l’écart le dépasse · le 29 ne devient jamais débiteur', () => {
    expect(plafondRepriseDepreciation({ ...texte, valeurNette: 10_000_000 })).toBe(4_000_000);
  });

  it('jamais négatif · une valeur nette déjà au-dessus ne rend rien', () => {
    expect(plafondRepriseDepreciation({ ...texte, valeurNette: 19_000_000 })).toBe(0);
  });

  it('refus nommés, le cumul d’abord, puis le § 2.4.2', () => {
    expect(motifRefusRepriseDepreciation({ ...texte, montant: 3_000_000 })).toBeNull();
    expect(motifRefusRepriseDepreciation({ ...texte, montant: 2_000_000 })).toBeNull();
    expect(motifRefusRepriseDepreciation({ ...texte, montant: 4_500_000 })).toMatch(/dépréciation encore inscrite/);
    expect(motifRefusRepriseDepreciation({ ...texte, montant: 3_500_000 })).toMatch(/plafonnée à 3000000\.00.*§ 2\.4\.2/);
  });
});
