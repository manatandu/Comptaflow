import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * TOUT CORPS DE REQUÊTE EST UNE CLASSE DÉCORÉE.
 *
 * Audit de l'interface du 2026-09-27, C10 · trois routes typaient leur corps
 * par un type littéral (`@Body() body: { … }`). Le ValidationPipe ne voit
 * alors aucune classe : ni liste blanche, ni vérification de type, et une
 * clé en trop passe là où partout ailleurs elle est refusée.
 */

function controleurs(dossier: string): string[] {
  return readdirSync(dossier, { withFileTypes: true }).flatMap((e) => {
    const chemin = join(dossier, e.name);
    if (e.isDirectory()) return controleurs(chemin);
    return e.name.endsWith('.controller.ts') ? [chemin] : [];
  });
}

describe('corps de requête', () => {
  const fichiers = controleurs(join(__dirname, '..'));

  it('le recensement trouve des contrôleurs', () => {
    expect(fichiers.length).toBeGreaterThan(30);
  });

  it('aucun @Body() n’est typé par un type littéral', () => {
    const fautifs = fichiers.flatMap((f) =>
      [...readFileSync(f, 'utf8').matchAll(/@Body\(\)\s+\w+\??:\s*\{/g)].map(() => f.split('/src/')[1]),
    );
    expect(fautifs).toEqual([]);
  });
});
