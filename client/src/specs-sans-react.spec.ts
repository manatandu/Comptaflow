import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Aucun import de « vitest » · convention du dépôt.

/**
 * UN SPEC CLIENT NE CHARGE JAMAIS REACT (2026-09-28). Le jest de la racine
 * tourne dans le déploiement AVANT l'installation du client · un spec qui
 * atteint un module important `react` y échoue au chargement, alors qu'il
 * passe partout où le client est installé. C'est arrivé avec `compteur.ts`,
 * et le déploiement est tombé. Les imports RELATIFS de chaque spec sont
 * suivis de proche en proche ; aucun module atteint n'importe un paquet
 * React. `import type` s'efface à la compilation et ne compte pas.
 */
const RACINE = __dirname;
const PAQUETS_REACT = /^(react|react-dom|react-router-dom)(\/|$)/;

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p) : [p];
  });
}

function resoudre(depuis: string, chemin: string): string | null {
  const base = resolve(dirname(depuis), chemin);
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function importsDe(fichier: string): string[] {
  const src = readFileSync(fichier, 'utf8');
  return [...src.matchAll(/^\s*(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
}

function atteintReact(spec: string): string | null {
  const vus = new Set<string>();
  const pile = [spec];
  while (pile.length) {
    const f = pile.pop()!;
    if (vus.has(f)) continue;
    vus.add(f);
    for (const i of importsDe(f)) {
      if (PAQUETS_REACT.test(i)) return f === spec ? `${f} importe ${i}` : `${f.slice(RACINE.length + 1)} importe ${i}`;
      if (i.startsWith('.')) {
        const r = resoudre(f, i);
        if (r) pile.push(r);
      }
    }
  }
  return null;
}

describe('les specs client se chargent sans React', () => {
  const specs = fichiers(RACINE).filter((f) => f.endsWith('.spec.ts'));

  it('le recensement trouve les specs', () => {
    expect(specs.length).toBeGreaterThan(100);
  });

  it('aucun spec n’atteint un module qui importe React', () => {
    expect(specs.map(atteintReact).filter(Boolean)).toEqual([]);
  });
});
