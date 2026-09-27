import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { jourDeKinshasaIso } from './echeance';

/** AUDIT FINAL F113 · la forme AAAA-MM-JJ du même jour, une seule définition. */
describe('jourDeKinshasaIso', () => {
  it('passe au lendemain entre minuit et une heure UTC', () => {
    expect(jourDeKinshasaIso(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01');
    expect(jourDeKinshasaIso(new Date('2026-12-31T22:30:00Z'))).toBe('2026-12-31');
  });

  it('la licence et les abonnements l’appellent au lieu de refaire le décalage', () => {
    const lire = (f: string) => readFileSync(join(__dirname, '..', 'modules', f), 'utf8');
    expect(lire('plateforme/licences-sur-site.service.ts')).toContain('return jourDeKinshasaIso(d);');
    expect(lire('plateforme/abonnements/abonnements.service.ts')).toContain(
      'const aujourdhuiKinshasa = () => jourDeKinshasaIso(new Date());',
    );
  });
});
