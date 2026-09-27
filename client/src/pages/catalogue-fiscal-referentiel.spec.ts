import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LE PLAN DES COMPTES N'APPELLE PAS UNE ROUTE QUE SON RÉFÉRENTIEL LUI FERME.
 *
 * Audit du 2026-09-26 · `/fiscalite/catalogue` est sous
 * `@ReferentielsAutorises(SYSCOHADA)` au niveau de la classe, et le plan des
 * comptes l'appelait pour tout dossier : un 403 à chaque ouverture chez une
 * association, avalé par le catch, donc invisible sauf au journal du serveur.
 */

const page = readFileSync(join(__dirname, 'PlanComptesPage.tsx'), 'utf8');
const controleur = readFileSync(join(__dirname, '../../../src/modules/fiscalite/fiscalite.controller.ts'), 'utf8');

describe('catalogue des retraitements et référentiel', () => {
  it('la route est fermée au SYCEBNL au niveau de la classe', () => {
    const avantClasse = controleur.slice(0, controleur.indexOf("@Controller('fiscalite')"));
    expect(avantClasse).toContain('@ReferentielsAutorises(Referentiel.SYSCOHADA)');
  });

  it("l'appel ne part que sous le SYSCOHADA, et se relance au changement de dossier", () => {
    // Corps de l'effet qui porte l'appel, découpé par ses bornes.
    const appel = page.indexOf("'/fiscalite/catalogue'");
    const debut = page.lastIndexOf('useEffect(', appel);
    const fin = page.indexOf('}, [', appel);
    const corps = page.slice(debut, fin);
    const garde = corps.indexOf("if (referentiel !== 'SYSCOHADA')");
    expect(garde).toBeGreaterThan(0);
    expect(garde).toBeLessThan(corps.indexOf("'/fiscalite/catalogue'"));
    expect(page.slice(fin, page.indexOf(')', fin))).toContain('[referentiel]');
  });
});
