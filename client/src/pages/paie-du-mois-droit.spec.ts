import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * PASSER LA PAIE AU JOURNAL · LE COMPOSANT LIT LUI-MÊME SON DROIT.
 *
 * Audit du 2026-09-26, C6 · `PaieDuMois` recevait le droit en prop sous le
 * nom `peutEcrire`. `ecriture-masquee.spec.ts` y voyait le mot et le tenait
 * pour un écran qui lit le droit, alors qu'il ne lisait rien : le jour où un
 * parent aurait passé `peutEcrire` au lieu de `peutValider`, l'aide-comptable
 * aurait vu un bouton que la route refuse (`@ReserveAuComptable`).
 */

const composant = readFileSync(join(__dirname, 'PaieDuMois.tsx'), 'utf8');
const parent = readFileSync(join(__dirname, 'BulletinsPaie.tsx'), 'utf8');

describe('droit de passer la paie du mois', () => {
  it('le composant lit peutValider dans le contexte de session', () => {
    expect(composant).toMatch(/const \{ peutValider \} = useAuth\(\);/);
  });

  it('aucun droit ne lui est passé en prop', () => {
    const appel = parent.slice(parent.indexOf('<PaieDuMois'), parent.indexOf('/>', parent.indexOf('<PaieDuMois')));
    expect(appel).not.toMatch(/\b(peutEcrire|peutValider|estAdmin)=/);
  });
});
