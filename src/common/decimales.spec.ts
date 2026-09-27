import { nombreDeDecimales } from './decimales';

/**
 * AUDIT FINAL F108 · le compte se fait sur l'écriture du nombre. Les valeurs
 * retenues sont celles où le produit par cent n'est PAS un entier en
 * flottant, et qui ont pourtant deux décimales · un test sur 1250,5 ne
 * prouvait rien, son produit tombant juste.
 */
describe('nombreDeDecimales', () => {
  it.each([
    [19.99, 2],
    [1.1, 1],
    [1234.1, 1],
    [0.07, 2],
    [1_000_000.01, 2],
    [1500, 0],
    [5e21, 0],
    [1.005, 3],
  ])('%p a %p décimale(s)', (x, n) => {
    expect(nombreDeDecimales(x)).toBe(n);
  });

  it('un nombre très petit dépasse tout plafond', () => {
    expect(nombreDeDecimales(1e-7)).toBeGreaterThan(2);
  });
});
