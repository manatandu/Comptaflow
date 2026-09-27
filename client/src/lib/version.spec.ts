import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { identiteConstruction, ligneVersion } from './version';

// Aucun import de « vitest » (globales) · convention du dépôt.

/** AUDIT FINAL F180 · « À propos » annonçait « Version de développement » en production. */
describe('l’identité de la construction', () => {
  it('dit la version, la révision, la date, et la date du paquet sur site', () => {
    expect(ligneVersion({ version: '0.0.1', commit: '9422276', construitLe: '2026-09-27' }, '2026-09-26')).toBe(
      'Version 0.0.1 · révision 9422276 · construite le 2026-09-27 · paquet sur site du 2026-09-26.',
    );
  });

  it('ce qui manque se dit, rien n’est inventé', () => {
    expect(ligneVersion({ version: null, commit: null, construitLe: null })).toBe(
      'Version non renseignée · révision non renseignée (construction locale).',
    );
  });

  it('ne lève pas quand le lanceur ne définit pas les constantes', () => {
    expect(() => identiteConstruction()).not.toThrow();
  });

  it('la construction pose les trois constantes, et la boîte les affiche', () => {
    const config = readFileSync(join(__dirname, '..', '..', 'vite.config.ts'), 'utf8');
    expect(config).toContain('__OMEGAX_VERSION__: JSON.stringify(process.env.npm_package_version ?? null)');
    expect(config).toContain('__OMEGAX_COMMIT__: JSON.stringify(process.env.GITHUB_SHA ? process.env.GITHUB_SHA.slice(0, 7) : null)');
    const apropos = readFileSync(join(__dirname, '..', 'components', 'chrome', 'AProposModale.tsx'), 'utf8');
    expect(apropos).toContain('{ligneVersion(identiteConstruction(), datePaquet)}');
    expect(apropos).toContain(".then((e) => vivant && e.surSite && setDatePaquet(e.dateVersion ?? null))");
  });
});
