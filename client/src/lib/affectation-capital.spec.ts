import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { libelleCapitalAffectation } from './affectation-capital';

// Aucun import de « vitest » · convention du dépôt.

describe('Affectation · le libellé du capital suit la racine lue par le serveur', () => {
  it('nomme le compte où le capital a été lu', () => {
    expect(libelleCapitalAffectation('101')).toBe('Capital social (101)');
    expect(libelleCapitalAffectation('102')).toBe('Capital par dotation (102)');
    expect(libelleCapitalAffectation('103')).toBe('Capital personnel (103)');
  });

  it('sans racine, pas de case · un zéro étiqueté 101 se lirait comme un capital nul', () => {
    expect(libelleCapitalAffectation(null)).toBeNull();
  });
});

describe('Affectation · l’écran lit la racine servie', () => {
  it('la case du capital est libellée par la racine du serveur, jamais en dur', () => {
    const page = readFileSync(join(__dirname, '../pages/AffectationPage.tsx'), 'utf8');
    expect(page).toContain('{libelleCapitalAffectation(prep.capitalRacine)}');
  });
});
