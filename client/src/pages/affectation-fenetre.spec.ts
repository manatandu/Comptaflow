import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fenetreDisponible } from '../lib/referentiel-fenetre';

/**
 * L'AFFECTATION DU RÉSULTAT EST COMMUNE AUX DEUX RÉFÉRENTIELS.
 *
 * Le réflexe, après l'audit, serait de la cloisonner : elle parle de réserve
 * légale, de dividendes, de capital social · tout le vocabulaire d'une société.
 * Ce serait la faute inverse. Les DEUX textes imposent de solder le compte 13,
 * et une association affecte son excédent par le même geste qu'une société
 * affecte son bénéfice · vers d'autres comptes, ce que dit la table des règles,
 * pas l'accès à la fenêtre.
 *
 * Ce spec fige donc une ABSENCE, ce qu'aucun test ne fait spontanément : la
 * fenêtre ne porte pas de `referentielsApplicables`, et le contrôleur pas de
 * `@ReferentielsAutorises`. Si quelqu'un en ajoute un par prudence mal placée,
 * la moitié des dossiers perdra l'écran qui vide leur compte 13.
 */

const CLIENT = join(__dirname, '..');
const lire = (p: string) => readFileSync(join(CLIENT, p), 'utf8');
const lireServeur = (p: string) => readFileSync(join(CLIENT, '../../src', p), 'utf8');

describe('Fenêtre Affectation du résultat', () => {
  it('est enregistrée et ouverte aux deux référentiels', () => {
    const registre = lire('lib/registre-fenetres.tsx');
    const bloc = registre
      .split(/\n  \{/)
      .find((b) => b.includes('/affectation-resultat'));
    expect(bloc).toBeDefined();
    expect(bloc).not.toContain('referentielsApplicables');
    // Et la fonction elle-même le confirme, pour les deux valeurs.
    for (const r of ['SYCEBNL', 'SYSCOHADA'] as const) {
      expect(fenetreDisponible({}, r)).toBe(true);
    }
  });

  it('a son entrée dans le menu Traitement, sans garde de référentiel', () => {
    const shell = lire('components/chrome/AppShell.tsx');
    const ligne = shell.split('\n').findIndex((l) => l.includes("navigate('/affectation-resultat')"));
    expect(ligne).toBeGreaterThan(-1);
    const voisinage = shell.split('\n').slice(Math.max(0, ligne - 6), ligne + 1).join('\n');
    expect(voisinage).not.toMatch(/estSycebnl/);
  });

  it('le contrôleur ne porte aucun @ReferentielsAutorises', () => {
    const controleur = lireServeur('modules/affectation/affectation.controller.ts');
    // Le DÉCORATEUR, pas le mot : le fichier le nomme dans son cartouche pour
    // expliquer pourquoi il ne le pose pas.
    const decorateurs = controleur
      .split('\n')
      .filter((l) => l.trim().startsWith('@ReferentielsAutorises'));
    expect(decorateurs).toEqual([]);
    // L'absence est DOCUMENTÉE · une absence non expliquée se relit comme un
    // oubli, et se « corrige » un jour.
    expect(controleur).toMatch(/aucun `@ReferentielsAutorises`/i);
  });
});
