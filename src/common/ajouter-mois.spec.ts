import { ajouterMois } from './ajouter-mois';

describe('ajouterMois · borné au dernier jour du mois (audit final F8)', () => {
  const jour = (d: Date) => d.toISOString().slice(0, 10);

  it('le 31 janvier plus un mois donne le 28 février, jamais le 3 mars', () => {
    expect([jour(ajouterMois(new Date('2026-01-31'), 1)), jour(ajouterMois(new Date('2028-01-31'), 1))]).toEqual([
      '2026-02-28',
      '2028-02-29',
    ]);
  });

  it('recule aussi, et traverse l’année', () => {
    expect([jour(ajouterMois(new Date('2026-03-31'), -1)), jour(ajouterMois(new Date('2026-11-30'), 3))]).toEqual([
      '2026-02-28',
      '2027-02-28',
    ]);
  });

  it('une fin de mois mène à une fin de mois quand on le demande (consolidation, art. 97)', () => {
    expect([
      jour(ajouterMois(new Date('2026-09-30'), 3, { finDeMoisSuit: true })),
      jour(ajouterMois(new Date('2026-09-30'), 3)),
    ]).toEqual(['2026-12-31', '2026-12-30']);
  });
});
