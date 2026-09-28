import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » · convention du dépôt.

/** La contrepartie d'une acquisition ne se choisit que dans la liste servie pour la famille. */
describe('immobilisation · contrepartie d’acquisition', () => {
  const page = readFileSync(join(__dirname, 'ImmobilisationsPage.tsx'), 'utf8');
  it('la liste vient du serveur, pour la famille choisie', () => {
    expect(page).toContain('`/immobilisations/contreparties-acquisition?familleId=${iFamilleId}`');
    const debut = page.indexOf('value={iCompteContrepartie}');
    expect(page.slice(debut, page.indexOf('</select>', debut))).toContain('(contrepartiesAdmises ?? []).map');
  });
});
