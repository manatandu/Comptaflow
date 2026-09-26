import { cleLisible } from './double-auth';

describe('la clé à recopier dans l’application', () => {
  it('se lit par groupes de quatre, sans espace final', () => {
    expect(cleLisible('ABCDEFGHIJKLMNOP')).toBe('ABCD EFGH IJKL MNOP');
    expect(cleLisible('ABCDEF')).toBe('ABCD EF');
  });
});
