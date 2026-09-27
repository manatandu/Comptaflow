import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LA TENUE DES STOCKS SE DÉCLARE À L'ÉCRAN.
 *
 * Audit du 2026-09-26, B5 · `PATCH /dossier/methode-inventaire-stocks`
 * existait, la variation de stocks en dépend (rien n'est proposé tant que le
 * mode n'est pas déclaré), et aucun écran ne l'appelait. Un réglage sans
 * porte est un cul-de-sac : la fenêtre de variation renvoyait à un choix
 * que personne ne pouvait faire.
 */

const page = readFileSync(join(__dirname, 'ParametresDossierPage.tsx'), 'utf8');
const controleur = readFileSync(join(__dirname, '../../../src/modules/tenant/tenant.controller.ts'), 'utf8');

describe('tenue des stocks dans Paramètres du dossier', () => {
  it('la route appelée est celle que le serveur expose', () => {
    expect(controleur).toContain("@Patch('methode-inventaire-stocks')");
    expect(page).toContain("'/dossier/methode-inventaire-stocks'");
  });

  it('les deux valeurs de l’énumération sont proposées, aucune préposée', () => {
    expect(page).toContain('<option value="PERMANENT">');
    expect(page).toContain('<option value="INTERMITTENT">');
    expect(page).toMatch(/value=\{params\.methodeInventaireStocks \?\? ''\}/);
  });

  it('réservée à l’administrateur, comme la route', () => {
    // Ancré sur la balise <select> elle-même, jamais sur une distance.
    const i = page.indexOf('value={params.methodeInventaireStocks');
    const select = page.slice(page.lastIndexOf('<select', i), page.indexOf('</select>', i));
    expect(select).toContain('disabled={!estAdmin || envoi}');
    const j = controleur.indexOf("@Patch('methode-inventaire-stocks')");
    const entete = controleur.slice(j, controleur.indexOf('async ', j));
    expect(entete).toContain('@Roles(RoleUtilisateur.ADMIN_CABINET)');
  });

  it('cite ses deux textes', () => {
    expect(page).toContain('AUDCIF Titre VII ch. 3, section 3 · SYCEBNL Partie 2 ch. 3, section 3');
  });
});
