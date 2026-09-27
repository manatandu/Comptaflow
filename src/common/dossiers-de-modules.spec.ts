import { readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * CHAQUE DOSSIER DE `src/modules/` PORTE SON MODULE NEST (audit du serveur, C3).
 *
 * `abonnements/` vivait à la racine des modules sans `*.module.ts`, ses
 * services fournis en douce par `PlateformeModule`. On le lisait comme un
 * module autonome, il n'en était pas un · et un service qu'un autre module
 * aurait voulu injecter n'y aurait rien trouvé. Il vit désormais sous
 * `plateforme/`, dont il dépend. Un dossier qui n'a pas de module est un
 * sous-dossier d'un autre, pas un voisin.
 */
describe('dossiers de src/modules', () => {
  const racine = join(__dirname, '..', 'modules');
  const dossiers = readdirSync(racine).filter((n) => statSync(join(racine, n)).isDirectory());

  it('le relevé trouve encore des modules', () => {
    expect(dossiers.length).toBeGreaterThan(30);
  });

  it('chaque dossier de premier niveau porte un *.module.ts', () => {
    const sansModule = dossiers.filter((d) => !readdirSync(join(racine, d)).some((f) => f.endsWith('.module.ts')));
    expect(sansModule).toEqual([]);
  });
});
