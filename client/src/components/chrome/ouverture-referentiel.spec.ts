import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fenetreDisponible } from '../../lib/referentiel-fenetre';

/**
 * LE CLOISONNEMENT NE VAUT QUE S'IL TIENT AUSSI PAR L'ADRESSE.
 *
 * `referentielsApplicables` était consulté à un seul endroit : la grille de
 * l'accueil. Les entrées de menu, elles, étaient gardées une par une, à la
 * main, par un `estSycebnl &&` recopié · et l'ouverture par l'URL, qui est le
 * point de passage OBLIGÉ de toute fenêtre, ne consultait rien du tout.
 *
 * Trois chemins mènent pourtant à la même fenêtre : le menu, la grille de
 * l'accueil, et l'adresse · tapée, collée depuis un courriel, ou simplement
 * restée dans l'historique du navigateur après un changement de dossier. Une
 * SARL pouvait donc ouvrir le registre des donateurs d'une ASBL en revenant
 * en arrière.
 *
 * Ce spec relie l'ouverture à sa source de vérité :
 *   1. la liste des fenêtres réservées est DÉDUITE du registre, jamais
 *      recopiée · une fenêtre qui perdrait son filtre fait tomber le test ;
 *   2. l'effet d'ouverture d'AppShell doit consulter `fenetreDisponible`
 *      AVANT d'ouvrir ;
 *   3. une entrée de menu qui mène à une fenêtre réservée doit rester gardée
 *      · la garde de l'URL est une défense en profondeur, pas une raison de
 *      montrer une entrée qu'on refusera d'ouvrir.
 */

const RACINE = join(__dirname, '../..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf8');

/** Adresses réservées à un référentiel, lues dans le registre lui-même. */
function adressesReservees(): Map<string, string> {
  const registre = lire('lib/registre-fenetres.tsx');
  const reservees = new Map<string, string>();
  for (const bloc of registre.split(/\n  \{/)) {
    const filtre = bloc.match(/referentielsApplicables: \['(\w+)'\]/);
    if (!filtre) continue;
    // Seules les adresses fixes sont vérifiables ici · une fenêtre à
    // paramètre (/comptes/:id/…) ne s'atteint pas depuis un menu.
    const motif = bloc.match(/motif: \/\^\\\/([a-z-]+)\$\//);
    if (motif) reservees.set('/' + motif[1], filtre[1]);
  }
  return reservees;
}

describe('Ouverture d’une fenêtre réservée à un référentiel', () => {
  const reservees = adressesReservees();

  it('le registre porte bien des fenêtres réservées · sinon ce spec ne teste rien', () => {
    expect(reservees.size).toBeGreaterThanOrEqual(6);
    expect(reservees.get('/groupe')).toBe('SYCEBNL');
    expect(reservees.get('/fiscalite')).toBe('SYSCOHADA');
  });

  it('fenetreDisponible refuse l’autre référentiel, et le dossier pas encore chargé', () => {
    const def = { referentielsApplicables: ['SYCEBNL'] as const };
    expect(fenetreDisponible({ ...def, referentielsApplicables: ['SYCEBNL'] }, 'SYCEBNL')).toBe(true);
    expect(fenetreDisponible({ ...def, referentielsApplicables: ['SYCEBNL'] }, 'SYSCOHADA')).toBe(false);
    // Tant que le dossier n'est pas chargé, rien de propre à un référentiel ·
    // plus sûr que de montrer puis retirer une fenêtre au chargement.
    expect(fenetreDisponible({ ...def, referentielsApplicables: ['SYCEBNL'] }, undefined)).toBe(false);
    // Sans filtre, fenêtre commune : elle s'ouvre même dossier non chargé.
    expect(fenetreDisponible({}, undefined)).toBe(true);
  });

  it('AppShell consulte fenetreDisponible AVANT d’ouvrir la fenêtre de l’URL', () => {
    const shell = lire('components/chrome/AppShell.tsx');
    const effet = shell.slice(shell.indexOf("if (location.pathname === '/') return;"));
    const garde = effet.indexOf('fenetreDisponible(');
    const ouverture = effet.indexOf('ouvrir(location.pathname');
    expect(garde).toBeGreaterThan(-1);
    expect(ouverture).toBeGreaterThan(-1);
    expect(garde).toBeLessThan(ouverture);
  });

  it('aucune entrée de menu ne mène à une fenêtre réservée sans garde de référentiel', () => {
    const lignes = lire('components/chrome/AppShell.tsx').split('\n');
    const fautives: string[] = [];
    lignes.forEach((ligne, i) => {
      for (const adresse of reservees.keys()) {
        if (!ligne.includes(`navigate('${adresse}')`)) continue;
        // La garde peut porter sur la ligne elle-même ou ouvrir le bloc
        // conditionnel juste au-dessus (les entrées sont écrites en
        // `...(estSycebnl ? [ … ] : [])`).
        const voisinage = lignes.slice(Math.max(0, i - 6), i + 1).join('\n');
        if (!/estSycebnl/.test(voisinage)) fautives.push(`${adresse} (ligne ${i + 1})`);
      }
    });
    expect(fautives).toEqual([]);
  });
});
