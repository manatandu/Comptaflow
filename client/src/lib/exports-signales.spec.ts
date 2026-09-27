import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * UN EXPORT QUI ÉCHOUE LE DIT.
 *
 * Audit du 2026-09-27, I9 · huit boutons appelaient `api.telecharger` en
 * `void` ou sans `await`. Sur licence expirée, 400 ou 500, rien ne se
 * téléchargeait et rien ne s'affichait. Deux formes admises désormais :
 * `api.telechargerOuSignaler(…, setErreur)`, qui ne rejette jamais, ou
 * `await api.telecharger(…)` dans un bloc qui porte son `catch`.
 */

const RACINE = join(__dirname, '..');

function fichiers(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) return fichiers(chemin);
    return /\.tsx?$/.test(e.name) && !e.name.includes('.spec.') ? [chemin] : [];
  });
}

const sources = fichiers(RACINE)
  .map((f) => ({ nom: relative(RACINE, f).replace(/\\/g, '/'), source: readFileSync(f, 'utf8') }))
  .filter((f) => f.nom !== 'lib/api.ts');

describe('exports signalés', () => {
  it('le recensement trouve encore des exports', () => {
    const n = sources.reduce((t, f) => t + (f.source.match(/api\.telecharger(OuSignaler)?\(/g) ?? []).length, 0);
    expect(n).toBeGreaterThan(8);
  });

  it('chaque appel direct à api.telecharger est attendu, dans un try qui a son catch', () => {
    const fautifs: string[] = [];
    for (const { nom, source } of sources) {
      for (const m of source.matchAll(/api\.telecharger\(/g)) {
        const i = m.index ?? 0;
        const attendu = /await\s+$/.test(source.slice(0, i));
        // Le try englobant : le dernier `try {` avant l'appel, et son `catch`
        // après l'appel.
        const t = source.lastIndexOf('try {', i);
        const c = source.indexOf('catch', i);
        const dansTry = t >= 0 && c > i && source.lastIndexOf('catch', i) < t;
        if (!attendu || !dansTry) fautifs.push(`${nom}:${source.slice(0, i).split('\n').length}`);
      }
    }
    expect(fautifs).toEqual([]);
  });

  it('telechargerOuSignaler reçoit toujours de quoi signaler', () => {
    const fautifs: string[] = [];
    for (const { nom, source } of sources) {
      for (const m of source.matchAll(/api\.telechargerOuSignaler\(/g)) {
        // Arguments de l'appel, découpés par équilibrage des parenthèses.
        let p = 0;
        let k = (m.index ?? 0) + m[0].length - 1;
        const debut = k;
        for (; k < source.length; k++) {
          if (source[k] === '(') p++;
          if (source[k] === ')' && --p === 0) break;
        }
        const args = source.slice(debut + 1, k);
        if (!/,\s*set\w+,?\s*$/.test(args)) fautifs.push(nom);
      }
    }
    expect(fautifs).toEqual([]);
  });
});
