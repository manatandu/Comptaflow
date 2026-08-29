import { lireDate, lireMontant } from './lecture-fichier';

/**
 * Ce qui arrive réellement d'un tableur francophone. Ces cas ne sont pas
 * théoriques : une balance exportée depuis Excel en locale française porte des
 * espaces insécables comme séparateurs de milliers et une virgule décimale,
 * et un logiciel anglo-saxon écrit l'inverse. Se tromper d'interprétation sur
 * une seule ligne fausse toute la reprise.
 */
describe('lireMontant', () => {
  it.each([
    ['1234.56', 1234.56],
    ['1 234,56', 1234.56],
    ['1 234,56', 1234.56], // espace insécable
    ['1 234,56', 1234.56], // espace fine insécable
    ['1.234,56', 1234.56], // milliers au point, décimale à la virgule
    ['1,234.56', 1234.56], // notation anglo-saxonne
    ['(1234.56)', -1234.56], // négatif entre parenthèses
    ['-500', -500],
    ['', 0],
    ['-', 0],
    ['12 000 CDF', 12000],
  ])('lit « %s » comme %s', (entree, attendu) => {
    expect(lireMontant(entree)).toBeCloseTo(attendu, 2);
  });

  it('renvoie null sur ce qui n’est pas un montant', () => {
    expect(lireMontant('n/a')).toBeNull();
    expect(lireMontant('douze')).toBeNull();
  });
});

describe('lireDate', () => {
  it.each([
    ['2026-03-15', '2026-03-15'],
    ['15/03/2026', '2026-03-15'],
    ['15-03-2026', '2026-03-15'],
    ['5/3/26', '2026-03-05'],
  ])('lit « %s » comme %s', (entree, attendu) => {
    expect(lireDate(entree)?.toISOString().slice(0, 10)).toBe(attendu);
  });

  it('renvoie null sur une date illisible', () => {
    expect(lireDate('')).toBeNull();
    expect(lireDate('le 3 mars')).toBeNull();
  });
});
