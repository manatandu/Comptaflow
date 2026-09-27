import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * « RAPPEL ET RELEVÉ » ÉDITE LE RELEVÉ.
 * Audit de l'interface du 2026-09-27, I12 · la route du relevé n'était
 * appelée par rien.
 */

const page = readFileSync(join(__dirname, 'RelancesPage.tsx'), 'utf8');
const controleur = readFileSync(join(__dirname, '../../../src/modules/relances/relances.controller.ts'), 'utf8');

describe('relevé de compte', () => {
  it('la route existe au serveur et la page l’appelle, bornée à l’exercice', () => {
    expect(controleur).toContain("@Get('releve/:compteId')");
    expect(page).toContain('`/relances/releve/${compteId}?exerciceId=${exerciceCourant.id}`');
  });

  it('le geste est ouvert à la lecture, comme la route', () => {
    // Le bouton vit dans un bloc que seule l'ouverture du détail conditionne,
    // pas `peutEcrire` · la route de lecture ne porte aucun @Roles.
    const bouton = page.indexOf("'Relevé de compte'");
    const bloc = page.slice(page.lastIndexOf('{deplie.has(p.compteId)', bouton), bouton);
    expect(bloc.startsWith('{deplie.has(p.compteId) && (')).toBe(true);
    const route = controleur.slice(controleur.indexOf("@Get('releve/:compteId')"), controleur.indexOf('async releve('));
    expect(route).not.toContain('@Roles');
  });
});
