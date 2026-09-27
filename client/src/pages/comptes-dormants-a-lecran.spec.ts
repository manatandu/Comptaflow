import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F68 · un compte repris sans mouvement depuis n'a pas de date de
 * dernier mouvement, et il n'est pas « jamais mouvementé » pour autant · le
 * serveur rend alors `dernierMouvement: null` avec `jamaisMouvemente: false`.
 * L'écran faisait `new Date(null)` et affichait le 1er janvier 1970.
 */
const page = readFileSync(join(__dirname, 'ControlesPage.tsx'), 'utf8');

describe('comptes dormants · la cellule du dernier mouvement', () => {
  it('ne construit jamais une date sur un dernier mouvement absent', () => {
    const i = page.indexOf("'Jamais mouvementé'");
    expect(i).toBeGreaterThan(0);
    const cellule = page.slice(i, page.indexOf('</td>', i));
    expect(cellule).toMatch(/c\.dernierMouvement\s*\?\s*new Date\(c\.dernierMouvement\)/);
    expect(cellule).toContain("'Aucun · solde reporté'");
  });
});
