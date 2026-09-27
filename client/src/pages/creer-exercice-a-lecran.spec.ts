import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * AUDIT FINAL F80 · `POST /exercices` n'avait aucun appel de l'écran · une
 * reprise (exercice antérieur), un exercice non contigu ou l'exercice de
 * liquidation ne pouvaient pas naître. Le serveur valide avec
 * `forbidNonWhitelisted` · chaque clé envoyée doit être une propriété du DTO.
 */
const page = readFileSync(join(__dirname, 'ExercicePage.tsx'), 'utf8');
const racine = join(__dirname, '../../..');
const dto = readFileSync(join(racine, 'src/modules/exercice/dto/creer-exercice.dto.ts'), 'utf8');
const controleur = readFileSync(join(racine, 'src/modules/exercice/exercice.controller.ts'), 'utf8');

/** Le bloc qui s'ouvre à l'accolade `debut`, par équilibrage. */
function bloc(source: string, debut: number): string {
  let profondeur = 0;
  for (let k = debut; k < source.length; k++) {
    if (source[k] === '{') profondeur++;
    if (source[k] === '}') profondeur--;
    if (profondeur === 0) return source.slice(debut, k + 1);
  }
  throw new Error('accolade non refermée');
}

describe('F80 · créer un exercice depuis l’écran', () => {
  it('la route est réservée à l’administrateur', () => {
    const i = controleur.indexOf('@Post()');
    expect(i).toBeGreaterThan(0);
    expect(controleur.slice(controleur.lastIndexOf('}', i), i)).toContain('@Roles(RoleUtilisateur.ADMIN_CABINET)');
  });

  it('la page appelle la route avec les seules clés du DTO', () => {
    const m = /api\.post\('\/exercices',\s*\{/.exec(page);
    expect(m).not.toBeNull();
    const corps = bloc(page, (m as RegExpExecArray).index + (m as RegExpExecArray)[0].length - 1);
    const envoyees = [...corps.matchAll(/(?:^|[\s{,])([a-zA-Z]+)\s*:/g)].map((x) => x[1]);
    const proprietes = new Set([...dto.matchAll(/^\s{2}([a-zA-Z]+)[?!]:/gm)].map((x) => x[1]));
    expect(envoyees.sort()).toEqual(['dateDebut', 'dateFin', 'liquidation']);
    expect(envoyees.filter((c) => !proprietes.has(c))).toEqual([]);
  });

  it('le bloc ne s’affiche qu’à l’administrateur', () => {
    const i = page.indexOf('Créer un exercice');
    expect(i).toBeGreaterThan(0);
    const avant = page.slice(0, i);
    const ouverture = avant.lastIndexOf('{estAdmin && (');
    expect(ouverture).toBeGreaterThan(0);
    // Le libellé est bien À L'INTÉRIEUR de ce bloc, par équilibrage des accolades.
    expect(bloc(page, ouverture).includes('Créer un exercice')).toBe(true);
  });
});
