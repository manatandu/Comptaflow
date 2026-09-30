import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// AUCUN import de « vitest » ici, volontairement · convention du dépôt (voir
// NotesAnnexesSyscohadaPage.spec.ts) : l'écran se vérifie sur sa SOURCE.

const page = readFileSync(join(__dirname, 'RetenuesPage.tsx'), 'utf8');
const serveur = readFileSync(
  join(__dirname, '../../../src/modules/retenues/correspondance-retenues.ts'),
  'utf8',
);

/**
 * PASSE F11 · l'impôt sur les revenus locatifs est provincial (Constitution,
 * art. 204, 16°). Le serveur sert désormais 'PROVINCE' sur la retenue
 * locative, et l'écran, qui ne connaissait que deux valeurs, la rangeait sous
 * « Organisme social » · le libellé du guichet était faux, sans erreur.
 */
describe('échéancier des retenues · le titulaire PROVINCE', () => {
  it('le serveur sert PROVINCE sur la retenue locative', () => {
    expect(serveur).toContain("beneficiaire: 'PROVINCE',");
  });

  it("l'écran rend la province sous son nom, par une seule table de libellés", () => {
    expect(page).toContain("if (beneficiaire === 'PROVINCE') return 'Province';");
    expect(page).toContain('{libelleBeneficiaire(e.beneficiaire)}');
  });
});
