import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CHEMINS_CACHES, cheminsAViderApres } from './cache-referentiels';

// Aucun import de « vitest » (globales) · convention du dépôt.

/**
 * AUDIT FINAL F249 · la création d'un tiers ouvre son compte individuel, et
 * la fusion de deux comptes met l'absorbé en sommeil, sans qu'aucun chemin
 * `/comptes` ne soit écrit · le plan gardé trente secondes était faux.
 */
const trie = (c: string[]) => [...c].sort();

describe('cheminsAViderApres · ce qu’une écriture rend faux', () => {
  it('une écriture sur le référentiel lui-même vide son entrée, et elle seule', () => {
    expect(cheminsAViderApres('/comptes')).toEqual(['/comptes']);
    expect(cheminsAViderApres('/comptes/c1')).toEqual(['/comptes']);
    expect(cheminsAViderApres('/journaux/j1')).toEqual(['/journaux']);
    expect(cheminsAViderApres('/journaux?actifs=true')).toEqual(['/journaux']);
  });

  it('la création d’un tiers et de son compte individuel vide le plan de comptes', () => {
    expect(cheminsAViderApres('/tiers')).toEqual(['/comptes']);
    expect(cheminsAViderApres('/tiers/t1/compte-individuel')).toEqual(['/comptes']);
  });

  it('la fusion de deux tiers et celle de deux comptes le vident aussi', () => {
    expect(cheminsAViderApres('/tiers/t1/fusion/t2')).toEqual(['/comptes']);
    expect(cheminsAViderApres('/ecritures/fusion-comptes')).toEqual(['/comptes']);
  });

  it('les natures, qui s’affichent dans la liste et réalignent le report, la vident', () => {
    expect(cheminsAViderApres('/natures-compte/aligner')).toEqual(['/comptes']);
    expect(cheminsAViderApres('/natures-compte/CLIENTS')).toEqual(['/comptes']);
  });

  it('l’import vide les deux référentiels', () => {
    expect(trie(cheminsAViderApres('/import/executer'))).toEqual(trie([...CHEMINS_CACHES]));
  });

  it('la famille se lit par segment entier · une écriture voisine ne vide rien', () => {
    expect(cheminsAViderApres('/ecritures')).toEqual([]);
    expect(cheminsAViderApres('/relances/tiers/t1/hors-relance')).toEqual([]);
    expect(cheminsAViderApres('/tiersx')).toEqual([]);
    expect(cheminsAViderApres('/comptes-rendus')).toEqual([]);
  });
});

describe('api.ts vide le cache à CHAQUE écriture, par la même règle', () => {
  const source = readFileSync(join(__dirname, 'api.ts'), 'utf8');

  it('viderCachePour passe par cheminsAViderApres', () => {
    const debut = source.indexOf('function viderCachePour(path: string) {');
    expect(debut).toBeGreaterThan(-1);
    const corps = source.slice(debut, source.indexOf('\n}', debut));
    expect(corps).toContain('cheminsAViderApres(path)');
  });

  it('post, put, patch, delete et l’envoi de fichier appellent viderCachePour', () => {
    for (const methode of ['post', 'put', 'patch', 'delete']) {
      const debut = source.indexOf(`  ${methode}: <T>(`);
      expect({ methode, trouve: debut > -1 }).toEqual({ methode, trouve: true });
      const corps = source.slice(debut, source.indexOf('\n  },', debut));
      expect({ methode, vide: corps.includes('viderCachePour(path);') }).toEqual({ methode, vide: true });
      // Et de nouveau à la réponse · une lecture partie pendant l'écriture a
      // pu remettre la liste d'avant en cache.
      expect({ methode, apres: corps.includes('.finally(() => viderCachePour(path))') }).toEqual({ methode, apres: true });
    }
    const debut = source.indexOf('async function envoyerFichier<T>(');
    expect(debut).toBeGreaterThan(-1);
    const corps = source.slice(debut, source.indexOf('\n}', debut));
    // Avant l'envoi, puis de nouveau quand la réponse est arrivée, refus
    // compris · comme les quatre autres écritures.
    expect(corps).toMatch(/\{\n {2}viderCachePour\(path\);\n/);
    expect(corps).toMatch(/\} finally \{\s*viderCachePour\(path\);\s*\}/);
  });
});
