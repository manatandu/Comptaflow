import { lirePaiementsEnInstance } from './paiements-en-instance';

describe('Repère H · lecture du paramètre (audit final F13)', () => {
  it('absent ou vide vaut « non renseigné », zéro reste zéro, un montant se lit', () => {
    expect([lirePaiementsEnInstance(undefined), lirePaiementsEnInstance(''), lirePaiementsEnInstance('0'), lirePaiementsEnInstance('1500.5')]).toEqual([
      null,
      null,
      0,
      1500.5,
    ]);
  });

  it('un montant illisible est refusé, jamais lu comme zéro', () => {
    expect(() => lirePaiementsEnInstance('mille')).toThrow(/illisibles/);
  });
});
