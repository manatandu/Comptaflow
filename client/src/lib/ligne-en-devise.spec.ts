import { readFileSync } from 'fs';
import { join } from 'path';
import { contrevaleur, coursPropose, devisesEtrangeres, motifLigneEnDevise, type DeviseDuDossier } from './ligne-en-devise';

/**
 * AUDIT FINAL F49 · la grille propose un cours et dit l'écart sur la ligne ;
 * le serveur reste juge (src/modules/comptabilite/ligne-en-devise.ts).
 */

const USD: DeviseDuDossier = {
  id: 'usd',
  code: 'USD',
  intitule: 'Dollar américain',
  estActive: true,
  cours: [
    { date: '2026-03-12T00:00:00.000Z', cours: '2860' },
    { date: '2026-03-10T00:00:00.000Z', cours: '2850.5' },
    { date: '2026-03-01T00:00:00.000Z', cours: '2800' },
  ],
};

describe('F49 · les devises proposées', () => {
  it('ni la monnaie de tenue ni une devise en sommeil', () => {
    const cdf = { ...USD, id: 'cdf', code: 'cdf' };
    const eur = { ...USD, id: 'eur', code: 'EUR', estActive: false };
    expect(devisesEtrangeres([USD, cdf, eur]).map((d) => d.id)).toEqual(['usd']);
  });
});

describe('F49 · le cours proposé', () => {
  it('celui du jour de la pièce, sinon le dernier d’avant, jamais un postérieur', () => {
    expect(coursPropose(USD, '2026-03-10')).toEqual({ cours: 2850.5, date: '2026-03-10' });
    expect(coursPropose(USD, '2026-03-11')).toEqual({ cours: 2850.5, date: '2026-03-10' });
    expect(coursPropose(USD, '2026-02-28')).toBeNull();
    expect(coursPropose(undefined, '2026-03-10')).toBeNull();
    expect(coursPropose(USD, '')).toBeNull();
  });

  it('ne dépend pas de l’ordre dans lequel les cours arrivent', () => {
    const croissant = { ...USD, cours: [...USD.cours].reverse() };
    expect(coursPropose(croissant, '2026-03-11')).toEqual({ cours: 2850.5, date: '2026-03-10' });
  });
});

describe('F49 · l’écart dit sur la ligne', () => {
  it('le montant de la ligne est la contrevaleur au cours saisi', () => {
    expect(contrevaleur(100, 2850.5)).toBe(285050);
    expect(motifLigneEnDevise({ francs: 285050, montantDevise: 100, cours: 2850.5, code: 'USD' })).toBeNull();
    expect(motifLigneEnDevise({ francs: 285000, montantDevise: 100, cours: 2850.5, code: 'USD' })).toMatch(/font 285050 CDF/);
    expect(motifLigneEnDevise({ francs: 285050, montantDevise: 100, cours: null, code: 'USD' })).toBeNull();
    expect(motifLigneEnDevise({ francs: 285050, montantDevise: 0, cours: 2850.5, code: 'USD' })).toMatch(/positif/);
  });

  it('les deux seuils sont ceux du serveur', () => {
    const serveur = readFileSync(join(__dirname, '../../../src/modules/comptabilite/ligne-en-devise.ts'), 'utf8');
    expect(serveur).toContain('const TOLERANCE = 0.01;');
    expect(serveur).toContain('const DEMI_UNITE_DU_COURS = 0.5e-6;');
    expect(serveur).toContain("MONNAIE_DE_TENUE");
  });
});
