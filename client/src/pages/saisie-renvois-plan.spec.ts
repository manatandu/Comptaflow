import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » · convention du dépôt.

/** Passe R1, C8 · la saisie montre le texte du renvoi du plan que le compte porte. */
describe('saisie · renvois annexés au plan SYSCOHADA', () => {
  const page = readFileSync(join(__dirname, 'SaisiePage.tsx'), 'utf8');
  it('les renvois sont lus au serveur et cherchés par le numéro du compte choisi', () => {
    expect(page).toContain("api.get<RenvoiDuPlan[]>('/comptes/renvois')");
    expect(page).toContain('renvoisDuPlan.find((r) => r.numero === compteChoisi.numero)');
    expect(page).toContain('{renvoiDuCompte.texte}');
  });
});
