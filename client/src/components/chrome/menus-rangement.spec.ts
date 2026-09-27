import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * RANGEMENT DES MENUS · audit de l'interface du 2026-09-27 (I1, I5, F4).
 *
 * Chaque test fige une PRÉSENCE dans la source, ancrée sur le bloc qu'elle
 * concerne, jamais une distance.
 */

const shell = readFileSync(join(__dirname, 'AppShell.tsx'), 'utf8');
const authServeur = readFileSync(join(__dirname, '../../../../src/modules/auth/auth.service.ts'), 'utf8');

const menu = (titre: string, suivant: string) =>
  shell.slice(shell.indexOf(`titre: '${titre}',`), shell.indexOf(`titre: '${suivant}',`));

describe('rangement des menus', () => {
  it("le journal d'audit est au menu Fichier, réservé à l'administrateur comme sa route", () => {
    expect(menu('Fichier', 'Structure')).toContain(
      `...(estAdmin ? [{ label: "Journal d'audit", chemin: '/journal-audit'`,
    );
  });

  it("la cloche n'est rendue qu'aux rôles à qui la file des courriels est ouverte", () => {
    const apres = shell.slice(shell.indexOf('apres={'), shell.indexOf('<CalculetteChrome />'));
    expect(apres).toContain("{fenetreOuverteAuRole('/courrier', utilisateur?.role) && <ClocheChrome />}");
  });

  it('les fenêtres qui écrivent ou s’alimentent vivent sous Traitement, plus sous État', () => {
    const traitement = menu('Traitement', 'État');
    const etat = menu('État', 'Fenêtre');
    for (const chemin of ['/declaration-tva', '/engagements', '/exonerations', '/registre-donateurs']) {
      expect([chemin, traitement.includes(`navigate('${chemin}')`)]).toEqual([chemin, true]);
      expect([chemin, etat.includes(`navigate('${chemin}')`)]).toEqual([chemin, false]);
    }
  });

  it('la session dit si le siège peut créer sa première cellule, aux conditions du service', () => {
    expect(authServeur).toContain(
      'peutCreerCellules: user.tenant.plafondCellules !== null && user.tenant.dossierMereId === null,',
    );
  });
});
