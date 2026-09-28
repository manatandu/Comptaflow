import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » (globales) · convention du dépôt.

/**
 * LE MOUVEMENT SE COUPE SOUS `prefers-reduced-motion`, TOUT LE MOUVEMENT.
 *
 * La feuille nommait jusqu'ici, une à une, les classes à figer · `.anim-fenetre`,
 * `.anim-menu`, `.squelette`… Une classe animée ajoutée demain sans être
 * recopiée dans cette liste aurait continué de bouger chez quelqu'un qui a
 * demandé au système de ne plus rien faire bouger (vestibulaire, migraine), et
 * rien ne l'aurait dit · la page reste parfaitement lisible pour qui relit.
 *
 * Ce qui est gelé ici est la PROPRIÉTÉ, pas la liste · une règle universelle
 * (`*`, `*::before`, `*::after`) qui pose `animation: none !important` et
 * `transition: none !important` dans le bloc du mouvement réduit, et rien dans
 * ce bloc qui les rallume. Et chaque `@keyframes` déclaré doit être employé ·
 * une animation morte dans la feuille est une animation que personne ne
 * vérifie plus.
 */

const css = readFileSync(join(__dirname, 'index.css'), 'utf8');
/** Les commentaires retirés · ils citent des noms d'animation pour les expliquer. */
const sansCommentaires = css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Le contenu entre l'accolade ouvrante qui suit `debut` et sa fermante. */
function bloc(source: string, debut: number): string {
  const ouvre = source.indexOf('{', debut);
  let profondeur = 0;
  for (let i = ouvre; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    else if (source[i] === '}') {
      profondeur--;
      if (profondeur === 0) return source.slice(ouvre + 1, i);
    }
  }
  throw new Error('accolade non refermée');
}

/** Tous les blocs `@media (prefers-reduced-motion: reduce)` de la feuille. */
function blocsMouvementReduit(source: string): string[] {
  const blocs: string[] = [];
  const motif = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/g;
  for (const m of source.matchAll(motif)) blocs.push(bloc(source, m.index!));
  return blocs;
}

/** Les règles d'un bloc, sélecteur et déclarations, au premier niveau. */
function regles(corps: string): { selecteurs: string[]; declarations: string }[] {
  return [...corps.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({
    selecteurs: m[1].split(',').map((s) => s.trim()),
    declarations: m[2],
  }));
}

/** Les noms des `@keyframes` déclarés. */
function keyframes(source: string): string[] {
  return [...source.matchAll(/@keyframes\s+([\w-]+)/g)].map((m) => m[1]);
}

/** La feuille sans les corps des `@keyframes` · c'est là que les noms s'EMPLOIENT. */
function horsKeyframes(source: string): string {
  let reste = source;
  for (;;) {
    const i = reste.search(/@keyframes\s+[\w-]+/);
    if (i < 0) return reste;
    const corps = bloc(reste, i);
    const fin = reste.indexOf(corps, i) + corps.length + 1;
    reste = reste.slice(0, i) + reste.slice(fin);
  }
}

/** Vrai si la feuille porte la règle universelle qui coupe tout. */
function coupeToutLeMouvement(source: string): boolean {
  return blocsMouvementReduit(source).some((corps) =>
    regles(corps).some(
      (r) =>
        ['*', '*::before', '*::after'].every((s) => r.selecteurs.includes(s)) &&
        /(^|;)\s*animation\s*:\s*none\s*!important/.test(r.declarations) &&
        /(^|;)\s*transition\s*:\s*none\s*!important/.test(r.declarations),
    ),
  );
}

describe('mouvement réduit · la feuille entière se fige', () => {
  it('le recensement trouve encore des @keyframes · sans quoi la suite ne prouve rien', () => {
    expect(keyframes(sansCommentaires).length).toBeGreaterThanOrEqual(10);
    expect(blocsMouvementReduit(sansCommentaires).length).toBeGreaterThanOrEqual(1);
  });

  it('une règle universelle coupe animation ET transition, pseudo-éléments compris', () => {
    expect(coupeToutLeMouvement(sansCommentaires)).toBe(true);
  });

  it('chaque @keyframes déclaré est donc neutralisé, et employé quelque part', () => {
    // La règle universelle couvre tout élément et ses deux pseudo-éléments ·
    // un @keyframes ne peut s'appliquer qu'à eux. Ce qui reste à vérifier est
    // qu'aucun ne dort dans la feuille sans emploi.
    const emplois = horsKeyframes(sansCommentaires);
    for (const nom of keyframes(sansCommentaires)) {
      const employe = new RegExp(`animation(-name)?\\s*:[^;{}]*\\b${nom}\\b`).test(emplois);
      expect({ nom, employe }).toEqual({ nom, employe: true });
    }
  });

  it('rien, dans le bloc du mouvement réduit, ne rallume une animation', () => {
    for (const corps of blocsMouvementReduit(sansCommentaires)) {
      expect(corps).not.toMatch(/@keyframes/);
      for (const r of regles(corps)) {
        for (const d of r.declarations.matchAll(/(animation(?:-name)?|transition)\s*:\s*([^;]+)/g)) {
          expect({ selecteurs: r.selecteurs, declaration: d[0].trim() }).toMatchObject({
            declaration: expect.stringMatching(/:\s*none\s*!important$/),
          });
        }
      }
    }
  });

  it('la vérification tombe si la règle universelle perd sa moitié transition', () => {
    // Mutation rejouée à chaque exécution · un garde-fou qui ne sait plus
    // échouer passe sans rien vérifier.
    const mute = sansCommentaires.replace(
      /(\*,\s*\*::before,\s*\*::after\s*\{[^}]*?)transition\s*:\s*none\s*!important\s*;/,
      '$1',
    );
    expect(mute).not.toBe(sansCommentaires);
    expect(coupeToutLeMouvement(mute)).toBe(false);
  });

  it('la vérification tombe si la règle universelle ne vise plus les pseudo-éléments', () => {
    const mute = sansCommentaires.replace(/\*,\s*\*::before,\s*\*::after\s*\{/, '* {');
    expect(mute).not.toBe(sansCommentaires);
    expect(coupeToutLeMouvement(mute)).toBe(false);
  });
});
