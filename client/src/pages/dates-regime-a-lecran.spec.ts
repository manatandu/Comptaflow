import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LES DATES DU RÉGIME DE TVA SE SAISISSENT ET S'EFFACENT À L'ÉCRAN · audit
 * final F237.
 *
 * `PATCH /dossier/regime` recevait la date d'option et celle de
 * l'autorisation aux débits, le serveur les servait, et aucun écran ne les
 * envoyait : ni pour les poser, ni pour les effacer. La correction du serveur
 * (la chaîne vide efface) n'avait donc aucune porte.
 */

const page = readFileSync(join(__dirname, 'ParametresDossierPage.tsx'), 'utf8');
const controleur = readFileSync(join(__dirname, '../../../src/modules/tenant/tenant.controller.ts'), 'utf8');

/** La balise <input> qui porte cette étiquette, ancrée sur la balise elle-même. */
const caseDe = (etiquette: string) => {
  const i = page.indexOf(`aria-label="${etiquette}"`);
  expect(i).toBeGreaterThan(-1);
  return page.slice(page.lastIndexOf('<input', i), page.indexOf('/>', i));
};

describe('dates du régime de TVA dans Paramètres du dossier', () => {
  it('la route appelée est celle que le serveur expose', () => {
    expect(controleur).toContain("@Patch('regime')");
    expect(page).toContain("'/dossier/regime'");
  });

  it('chaque date a sa case, qui envoie son champ en la quittant', () => {
    const option = caseDe('Date d’effet de l’assujettissement');
    expect(option).toContain('type="date"');
    expect(option).toContain("quitterDate('dateOptionTva', e.target)");
    const debits = caseDe('Date de l’autorisation aux débits');
    expect(debits).toContain('type="date"');
    expect(debits).toContain("quitterDate('dateAutorisationDebitsTva', e.target)");
  });

  it('réservées à l’administrateur, comme la route', () => {
    expect(caseDe('Date d’effet de l’assujettissement')).toContain('disabled={!estAdmin || envoi}');
    expect(caseDe('Date de l’autorisation aux débits')).toContain('disabled={!estAdmin || envoi}');
    const j = controleur.indexOf("@Patch('regime')");
    expect(controleur.slice(j, controleur.indexOf('async ', j))).toContain('@Roles(RoleUtilisateur.ADMIN_CABINET)');
  });

  it('la case quittée passe par la règle, saisie incomplète comprise', () => {
    const debut = page.indexOf('const quitterDate');
    expect(debut).toBeGreaterThan(-1);
    const corps = page.slice(debut, page.indexOf('\n  };', debut));
    expect(corps).toContain('dateQuittee(caseDate.value, caseDate.validity.badInput');
    expect(corps).toContain('changerRegime(');
  });

  it('une date restée enregistrée reste affichée, pour pouvoir être effacée', () => {
    expect(page).toContain('params.assujettiTva || params.dateOptionTva !== null');
    expect(page).toContain('params.dateAutorisationDebitsTva !== null');
  });
});
