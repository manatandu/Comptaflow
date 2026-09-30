import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » · convention du dépôt, le spec lit une source.

/**
 * LE TEXTE DE L'INSCRIPTION EST CELUI DU DOSSIER (passe D3, A1 et B2). La bulle
 * d'aide servait « SYCEBNL art. 20 » à toute société · une SARL lisait qu'un
 * texte qui ne la régit pas lui imposait l'inscription. Le serveur sert le
 * fondement (`fondementInscription`), l'écran le montre.
 */
const page = readFileSync(join(__dirname, 'MandatAuditeurPage.tsx'), 'utf8');

describe('Mandat du contrôleur · l’écran lit ce que le serveur sert', () => {
  it('la bulle de l’inscription cite le fondement servi', () => {
    expect(page).toContain('source={fondement.source}');
  });

  it('l’organe que la SA ne connaît pas est dit et bloque l’envoi (art. 703)', () => {
    expect(page).toContain('{duree.organeRefuse}');
    expect(page).toContain('disabled={Boolean(duree?.organeRefuse)');
  });

  it('le remplacement et le suppléant se déclarent avec le mandat continué (art. 706 et 728)', () => {
    expect(page).toContain("natureSuccession: succession, mandatOrigineId");
  });
});
