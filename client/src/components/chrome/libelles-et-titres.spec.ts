import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » · convention du dépôt, le spec tourne aussi sous
// le jest de la racine.

/**
 * UNE COMMANDE PORTE LE NOM DE LA FENÊTRE QU'ELLE OUVRE (audit de
 * l'interface C2). Le menu disait « Magasin et fiches de stock », la barre de
 * titre « Magasin · fiches de stock », l'accueil « Retenues et fiscal » pour
 * « Retenues et échéancier fiscal » · onze écarts, et l'utilisateur ne savait
 * plus s'il était arrivé où il avait cliqué.
 *
 * Deux règles, lues dans les sources :
 *   1. une commande SANS paramètre (elle ouvre la fenêtre elle-même) porte le
 *      `titre` du registre, points de suspension d'un assistant exceptés ;
 *   2. une commande AVEC paramètre ouvre un onglet ou une action · elle a son
 *      propre nom, mais le menu et l'accueil lui donnent LE MÊME.
 */

const RACINE = join(__dirname, '../..');
const lire = (p: string) => readFileSync(join(RACINE, p), 'utf8');

function titresDuRegistre(): Map<string, string> {
  const titres = new Map<string, string>();
  const motif = /motif: \/\^\\\/([a-z0-9-]+)\$\/,\s*titre: (['"])(.*?)\2/g;
  for (const m of lire('lib/registre-fenetres.tsx').matchAll(motif)) titres.set('/' + m[1], m[3]);
  return titres;
}

function commandes(fichier: string): Array<{ label: string; chemin: string }> {
  const motif = /label: (['"])(.*?)\1, (?:separateurAvant: true, )?chemin: '([^']+)'/g;
  return [...lire(fichier).matchAll(motif)].map((m) => ({ label: m[2], chemin: m[3] }));
}

const FICHIERS = ['components/chrome/AppShell.tsx', 'pages/AccueilPage.tsx'];

describe('libellés des commandes et titres des fenêtres', () => {
  const titres = titresDuRegistre();
  const toutes = FICHIERS.flatMap((f) => commandes(f).map((c) => ({ ...c, fichier: f })));

  it('le recensement trouve des commandes et des titres · sinon rien n’est vérifié', () => {
    expect(titres.size).toBeGreaterThan(40);
    expect(toutes.length).toBeGreaterThan(60);
  });

  it('une commande sans paramètre porte le titre de sa fenêtre', () => {
    const ecarts = toutes
      .filter((c) => !c.chemin.includes('?') && titres.has(c.chemin))
      .filter((c) => c.label.replace(/…$/, '') !== titres.get(c.chemin))
      .map((c) => `${c.fichier} ${c.chemin} « ${c.label} » ≠ « ${titres.get(c.chemin)} »`);
    expect(ecarts).toEqual([]);
  });

  it('une commande avec paramètre a le même nom au menu et à l’accueil', () => {
    const parChemin = new Map<string, Set<string>>();
    for (const c of toutes.filter((c) => c.chemin.includes('?'))) {
      parChemin.set(c.chemin, (parChemin.get(c.chemin) ?? new Set()).add(c.label));
    }
    const ecarts = [...parChemin].filter(([, l]) => l.size > 1).map(([ch, l]) => `${ch} : ${[...l].join(' / ')}`);
    expect(ecarts).toEqual([]);
  });
});
