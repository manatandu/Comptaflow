import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { chargeInteretsAdmise, chargeInteretsProposee, interetsCourusDe } from './interets-courus';

/**
 * Ligne A12 · l'écran offre ce que le serveur admet
 * (src/modules/regularisation/interets-courus.ts) · mêmes cas, rejoués ici.
 */
const CAS: Array<['SYSCOHADA' | 'SYCEBNL', string, string | null]> = [
  ['SYSCOHADA', '16110000', '1661'],
  ['SYSCOHADA', '16200000', '1662'],
  ['SYSCOHADA', '16300000', '1663'],
  ['SYSCOHADA', '16400000', '1664'],
  ['SYSCOHADA', '16510000', '1665'],
  ['SYSCOHADA', '16720000', '1667'],
  ['SYSCOHADA', '16840000', '1668'],
  ['SYSCOHADA', '16810000', null],
  ['SYSCOHADA', '16610000', null],
  ['SYSCOHADA', '18100000', null],
  ['SYCEBNL', '18100000', '1861'],
  ['SYCEBNL', '18200000', '1862'],
  ['SYCEBNL', '18300000', '1863'],
  ['SYCEBNL', '18510000', '1865'],
  ['SYCEBNL', '18800000', '1868'],
  ['SYCEBNL', '18400000', null],
  ['SYCEBNL', '18710000', null],
  ['SYCEBNL', '16200000', null],
];

describe('intérêts courus · miroir du serveur', () => {
  it.each(CAS)('%s %s → %s', (referentiel, numero, attendu) => {
    expect(interetsCourusDe(referentiel, numero)).toBe(attendu);
  });

  it('les mêmes cas admis figurent au spec du serveur', () => {
    const serveur = readFileSync(join(__dirname, '../../../src/modules/regularisation/interets-courus.spec.ts'), 'utf8');
    for (const [, numero, attendu] of CAS) if (attendu) expect(serveur).toContain(`'${numero}'`);
  });

  it('charges admises et proposées', () => {
    expect(['67110000', '67120000', '67410000', '67420000', '67480000'].every(chargeInteretsAdmise)).toBe(true);
    expect(['67130000', '67140000', '67440000'].some(chargeInteretsAdmise)).toBe(false);
    expect(chargeInteretsProposee('SYSCOHADA', '16200000')).toBe('6712');
    expect(chargeInteretsProposee('SYCEBNL', '18100000')).toBe('6711');
    expect(chargeInteretsProposee('SYCEBNL', '18400000')).toBeNull();
  });

  it('l’emprunt part avec la demande', () => {
    const page = readFileSync(join(__dirname, '../pages/RegularisationPage.tsx'), 'utf8');
    expect(page).toContain("...(natureTiers === 'PRETEURS' && compteEmpruntId ? { compteEmpruntId } : {})");
  });
});
