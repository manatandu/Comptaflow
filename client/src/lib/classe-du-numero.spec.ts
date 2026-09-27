import { classeDuNumero } from './classe-du-numero';

describe('la classe se lit dans le numéro (audit final F40)', () => {
  it('prend le premier chiffre', () => {
    expect(classeDuNumero('60100000')).toBe('CLASSE_6');
    expect(classeDuNumero('411')).toBe('CLASSE_4');
    expect(classeDuNumero('9')).toBe('CLASSE_9');
  });
  it('rend null sans chiffre de classe', () => {
    expect(classeDuNumero('')).toBeNull();
    expect(classeDuNumero('0123')).toBeNull();
  });
});
