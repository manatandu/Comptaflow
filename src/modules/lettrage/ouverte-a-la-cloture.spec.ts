import { ouverteALaCloture } from './ouverte-a-la-cloture';

/**
 * La règle que les notes par échéance et l'état des créances et dettes des
 * deux SMT partagent (audit final F10). Les doublures de ces trois specs
 * n'honorent que la PRÉSENCE de la règle · ce qu'elle filtre est gelé ici :
 * sans lettre, ou lettrée par une écriture datée APRÈS la clôture.
 */
describe('Ligne ouverte à la clôture', () => {
  it('garde la ligne sans lettre, et celle que soldait un règlement postérieur à la clôture', () => {
    const fin = new Date('2026-12-31');
    expect(ouverteALaCloture(fin)).toEqual({
      OR: [{ lettre: null }, { lettrage: { lignes: { some: { ecriture: { date: { gt: fin } } } } } }],
    });
  });
});
