import { montantSaisi } from './montant-saisi';

/**
 * LIGNE A5 (relecture adverse m4) · un champ de montant vide n'est pas zéro ·
 * `Number('')` rend 0, et la déclaration partait à zéro sans qu'on l'ait tapé.
 */
describe('montant saisi d’une provision d’ouverture', () => {
  it('vide ou blanc · null, jamais zéro', () => {
    expect(montantSaisi('')).toBeNull();
    expect(montantSaisi('   ')).toBeNull();
  });
  it('zéro tapé · zéro', () => {
    expect(montantSaisi('0')).toBe(0);
  });
  it('virgule décimale et espaces de milliers lus', () => {
    expect(montantSaisi('100 000,50')).toBe(100000.5);
  });
  it('illisible · null', () => {
    expect(montantSaisi('abc')).toBeNull();
  });
});
