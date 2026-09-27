import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * AUCUN DTO DANS UN FICHIER DE CONTRÔLEUR (audit du serveur, C6).
 *
 * Un DTO déclaré dans le contrôleur ne se trouve pas là où on le cherche
 * (`dto/` ou `*.dto.ts`, selon le module), et il tire dans le contrôleur les
 * imports de validation qui n'y ont rien à faire. Six vivaient ainsi.
 */
function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((n) => {
    const p = join(dossier, n);
    return statSync(p).isDirectory() ? fichiers(p) : [p];
  });
}

describe('DTO hors des contrôleurs', () => {
  const controleurs = fichiers(join(__dirname, '..', 'modules')).filter((f) => f.endsWith('.controller.ts'));

  it('le relevé trouve encore des contrôleurs', () => {
    expect(controleurs.length).toBeGreaterThan(50);
  });

  it('aucun contrôleur ne déclare de classe *Dto ni n’importe class-validator', () => {
    const fautifs = controleurs.filter((f) => {
      const s = readFileSync(f, 'utf8');
      return /^export class \w+Dto\b/m.test(s) || /from 'class-validator'/.test(s);
    });
    expect(fautifs).toEqual([]);
  });
});
