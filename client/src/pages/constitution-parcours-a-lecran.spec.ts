import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CONSTATS D1-B1, D1-A5, D1-B3 · la checklist dit ce que la loi ne régit pas
 * et ce que le dossier ne peut pas porter, au lieu d'une liste ou d'un
 * « non renseigné » que personne ne peut lever.
 */
const page = readFileSync(join(__dirname, 'ConstitutionPage.tsx'), 'utf8');

describe('Constitution · ce que l’écran dit à la place d’une liste', () => {
  it('une forme hors loi n° 004/2001 reçoit le motif du serveur, sans étapes', () => {
    const i = page.indexOf('if (p.horsParcours) {');
    expect(i).toBeGreaterThan(-1);
    // Le motif est rendu AVANT la boucle des étapes.
    expect(i).toBeLessThan(page.indexOf('p.etapes.map('));
    expect(page).toContain('{p.horsParcours}</section>');
  });

  it('une étape sans champ au dossier affiche son motif, pas « non renseigné »', () => {
    expect(page).toMatch(/e\.motifSansProduit && <span className="text-\[11px\] text-text-dim">\{e\.motifSansProduit\}<\/span>/);
  });
});
