import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * UNE MODALE NE SORT JAMAIS DE L'ÉCRAN PAR LE HAUT.
 *
 * Le débordement vers le haut est le seul qui soit IRRÉCUPÉRABLE : aucune
 * barre de défilement ne remonte au-dessus du bord supérieur, et l'utilisateur
 * n'a aucun geste pour aller chercher ce qui s'y trouve. Le titre d'une
 * modale, ses onglets et sa croix de fermeture y passent en premier.
 *
 * Deux causes distinctes, toutes deux mesurées au navigateur avant d'être
 * corrigées (viewport 1280 × 800) :
 *
 *  1. LE BLOC CONTENEUR · `position: fixed` ne se résout pas sur la fenêtre du
 *     navigateur quand un ancêtre porte `filter`, `backdrop-filter`,
 *     `transform`, `perspective` ou `contain: paint`. La barre de menus porte
 *     `backdrop-blur-md` : la calculette appelée depuis son icône se centrait
 *     sur une barre de 26 px, sommet mesuré à -105 px. Portée dans le `<body>`,
 *     la même modale se pose à 250 px. D'où `PortailModale`.
 *  2. LA HAUTEUR NON BORNÉE · une modale plus haute que l'écran, centrée par
 *     `items-center`, déborde des DEUX côtés à parts égales. Mesuré : une
 *     modale de 1 200 px sur un écran de 800 px commence à -200 px. Bornée à
 *     `calc(100dvh-2rem)` avec un défilement interne, elle commence à 16 px.
 *
 * Ce test gèle la seconde règle pour TOUTES les modales du dossier, y compris
 * celles qui n'existent pas encore · sept l'enfreignaient au moment de
 * l'écrire, dans trois écrans (groupe, plateforme, utilisateurs).
 *
 * Aucun import de « vitest » (globales) : les deux lanceurs exécutent ce
 * fichier.
 */

const RACINE = join(__dirname, '..');

function fichiersTsx(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiersTsx(chemin);
    return chemin.endsWith('.tsx') ? [chemin] : [];
  });
}

/** Chaque voile `fixed inset-0` du dossier, avec la classe de son conteneur. */
function voiles(): { fichier: string; ligne: number; conteneur: string }[] {
  const trouves: { fichier: string; ligne: number; conteneur: string }[] = [];
  for (const chemin of fichiersTsx(RACINE)) {
    const lignes = readFileSync(chemin, 'utf8').split('\n');
    lignes.forEach((l, i) => {
      if (!l.includes('fixed inset-0')) return;
      // Le conteneur de la modale est le premier élément habillé qui suit le
      // voile · c'est lui qui porte la borne de hauteur.
      const bloc = lignes.slice(i, i + 9).join('\n');
      const m = bloc.match(/className="([^"]*(?:anim-modale|anim-fenetre|bg-surface)[^"]*)"/);
      if (m) trouves.push({ fichier: chemin.replace(RACINE + '/', ''), ligne: i + 1, conteneur: m[1] });
    });
  }
  return trouves;
}

describe('Toute modale reste dans l’écran', () => {
  it('recense bien les voiles du dossier · sans quoi le test suivant ne prouve rien', () => {
    // Le garde-fou du garde-fou : un test qui ne trouverait plus aucune modale
    // passerait sans rien vérifier.
    expect(voiles().length).toBeGreaterThan(15);
  });

  it('BORNE SA HAUTEUR · une modale plus haute que l’écran déborde par le haut', () => {
    // L'échec nomme le fichier et la ligne : « OK » / « SANS BORNE » plutôt
    // qu'un booléen, pour qu'on sache quoi ouvrir sans relire tout l'écran.
    for (const v of voiles()) {
      const borne = /max-h-(?:full|\[)/.test(v.conteneur);
      expect(`${v.fichier}:${v.ligne} ${borne ? 'OK' : 'SANS BORNE'}`).toBe(`${v.fichier}:${v.ligne} OK`);
    }
  });

  it('la calculette passe par le PORTAIL · sa barre d’appel est floutée', () => {
    // `backdrop-blur-md` sur la barre de menus fait d'elle le bloc conteneur
    // des descendants `fixed`. Le portail rend la modale indépendante de
    // l'endroit d'où elle est appelée.
    const calculette = readFileSync(join(__dirname, 'Calculette.tsx'), 'utf8');
    expect(calculette).toContain('<PortailModale>');
    expect(calculette).toContain("from './PortailModale'");
    const portail = readFileSync(join(__dirname, 'PortailModale.tsx'), 'utf8');
    expect(portail).toContain('createPortal(children, document.body)');
  });

  it('tout voile appelé depuis une barre du chrome passe par le portail', () => {
    // Les barres floutées du chrome · celles qui créent un bloc conteneur.
    // Toute modale rendue DEPUIS l'une d'elles doit être portée, faute de quoi
    // elle se centrera sur une barre de 21 à 26 px.
    const chrome = join(RACINE, 'components/chrome');
    const barresFloutees = fichiersTsx(chrome).filter((f) =>
      readFileSync(f, 'utf8').includes('backdrop-blur'),
    );
    expect(barresFloutees.length).toBeGreaterThan(0);
    for (const f of barresFloutees) {
      const source = readFileSync(f, 'utf8');
      // Un voile écrit DANS la barre elle-même serait le même piège.
      expect(`${f.replace(RACINE + '/', '')}: ${source.includes('fixed inset-0')}`).toBe(
        `${f.replace(RACINE + '/', '')}: false`,
      );
    }
  });
});
