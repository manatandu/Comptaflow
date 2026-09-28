import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F186 · le contrôle des cumuls montre une tranche des lignes
 * sans répartition, et l'écran le DIT · « 500 écriture(s) sans répartition »
 * sur une liste bornée se lirait comme le total. Chaque test découpe le bloc
 * qui porte la propriété.
 */
const page = readFileSync(join(__dirname, 'EtatsAnalytiquesPage.tsx'), 'utf8');
const types = readFileSync(join(__dirname, '..', 'lib', 'types.ts'), 'utf8');

function bloc(source: string, debut: string, fin: string): string {
  const i = source.indexOf(debut);
  expect(i).toBeGreaterThan(0);
  const j = source.indexOf(fin, i);
  expect(j).toBeGreaterThan(i);
  return source.slice(i, j);
}

describe('F186 · la liste des lignes sans répartition dit sa tranche', () => {
  it('le type de la réponse porte le décompte exact et la troncature', () => {
    const type = bloc(types, 'export interface ControleCumuls {', 'lignesSansRepartition: {');
    expect(type).toContain('nombreSansRepartition: number;');
    expect(type).toContain('tronque: boolean;');
  });

  it('tronquée, l’en-tête de la liste dit « n premières sur N », N étant le décompte du serveur', () => {
    const entete = bloc(page, '{c.lignesSansRepartition.length > 0 && (', '<div className="max-h-[240px]');
    expect(entete).toContain('{c.tronque');
    expect(entete).toContain(
      "`${c.lignesSansRepartition.length} premières sur ${c.nombreSansRepartition.toLocaleString('fr-FR')} écriture(s) sans répartition`",
    );
  });
});
