import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * LE SERVEUR SE CONSTRUIT SANS L'INTERFACE · `nest build` compile tout ce que
 * src/ importe. Un seul `import` statique vers client/ (même depuis un spec)
 * lui fait compiler l'interface, ranger le serveur sous dist/src/ au lieu de
 * dist/, et l'image Docker, qui ne copie pas client/, cesse de se construire.
 * Vécu le 2026-09-26 · les tests et la construction locale étaient verts, le
 * déploiement est tombé. Un spec qui lit un fichier de client/ le fait par
 * `readFileSync` ou par un `require` au chemin calculé.
 */
function fichiersTs(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiersTs(chemin) : nom.endsWith('.ts') ? [chemin] : [];
  });
}

describe('construction du serveur', () => {
  const fichiers = fichiersTs(join(__dirname));

  it('le recensement trouve les sources du serveur', () => {
    expect(fichiers.length).toBeGreaterThan(100);
  });

  it('aucun fichier de src/ n’importe statiquement un module de client/', () => {
    const fautifs = fichiers.filter((f) => /(?:from|import)\s+['"](?:\.\.\/)+client\//.test(readFileSync(f, 'utf8')));
    expect(fautifs).toEqual([]);
  });
});
