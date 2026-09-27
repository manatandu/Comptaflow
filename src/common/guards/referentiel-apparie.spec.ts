import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

/**
 * LE DÉCORATEUR ET LA GARDE VONT PAR DEUX (CLAUDE.md § 6, audit du serveur C5).
 *
 * `@ReferentielsAutorises` sans `ReferentielGuard` n'est qu'un commentaire ·
 * la route reste ouverte à l'autre référentiel par un appel direct, alors que
 * le menu la masque. Et `ReferentielGuard` sans aucun décorateur ne filtre
 * rien · le lecteur croit la route cloisonnée. Les deux défauts se voient au
 * fichier, et ce spec les cherche dans tous les contrôleurs.
 */
function controleurs(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) return controleurs(chemin);
    return e.name.endsWith('.controller.ts') ? [chemin] : [];
  });
}

describe('ReferentielsAutorises et ReferentielGuard · toujours ensemble', () => {
  const fichiers = controleurs(join(__dirname, '../..'));
  const lus = fichiers.map((f) => {
    const source = readFileSync(f, 'utf-8');
    return {
      fichier: relative(join(__dirname, '../..'), f),
      decore: source.includes('@ReferentielsAutorises('),
      garde: /@UseGuards\([^)]*\bReferentielGuard\b/.test(source),
    };
  });

  it('le recensement trouve des contrôleurs cloisonnés · sinon rien n’est vérifié', () => {
    expect(lus.filter((c) => c.decore && c.garde).length).toBeGreaterThan(5);
  });

  it('aucun décorateur sans sa garde', () => {
    expect(lus.filter((c) => c.decore && !c.garde).map((c) => c.fichier)).toEqual([]);
  });

  it('aucune garde sans décorateur', () => {
    expect(lus.filter((c) => c.garde && !c.decore).map((c) => c.fichier)).toEqual([]);
  });
});
