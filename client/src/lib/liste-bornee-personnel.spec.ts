import { libelleListeBornee } from './liste-bornee-personnel';

/**
 * AUDIT FINAL F259 · une liste du registre bornée par le serveur le dit, et
 * une liste entière ne dit rien.
 */
describe('libelleListeBornee', () => {
  it('dit la tranche et le total quand le serveur a tronqué', () => {
    expect(libelleListeBornee({ total: 1234, tronque: true }, 1000, 'salariés')).toBe(
      'Liste tronquée · 1000 sur 1234 salariés.',
    );
  });

  it('se tait sur une liste entière, même pleine', () => {
    expect(libelleListeBornee({ total: 500, tronque: false }, 500, 'avances')).toBeNull();
    expect(libelleListeBornee({ total: 0, tronque: false }, 0, 'rubriques')).toBeNull();
  });
});
