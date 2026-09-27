import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FORMES_PERSONNES_PHYSIQUES } from './formes-juridiques-syscohada';

// Aucun import de « vitest » · convention du dépôt, le spec tourne aussi sous
// le jest de la racine.

/**
 * UNE PERSONNE PHYSIQUE N'A PAS DE CAPITAL SOCIAL, et c'est le serveur qui le
 * refuse (`motifRefusCapital`). L'écran portait sa propre copie de la liste,
 * écrite à la main dans une condition · une forme ajoutée d'un seul côté
 * aurait fait proposer à l'écran un champ que la route refuse, ou l'inverse.
 * Le serveur fait foi ; ce spec relit sa liste dans la source.
 */
describe('formes de personne physique · une seule liste, deux côtés', () => {
  const serveur = readFileSync(
    join(__dirname, '../../../src/modules/retenues/correspondance-retenues.ts'),
    'utf8',
  );

  it('le client porte exactement les formes du serveur', () => {
    const bloc = serveur.match(/export const FORMES_PERSONNES_PHYSIQUES[^=]*=\s*\[([\s\S]*?)\];/);
    expect(bloc).not.toBeNull();
    const formes = [...(bloc as RegExpMatchArray)[1].matchAll(/FormeJuridiqueSyscohada\.(\w+)/g)].map((m) => m[1]);
    expect(formes.length).toBeGreaterThan(0);
    expect([...FORMES_PERSONNES_PHYSIQUES].sort()).toEqual(formes.sort());
  });

  it('l’écran des paramètres lit la liste au lieu de la réécrire', () => {
    const page = readFileSync(join(__dirname, '../pages/ParametresDossierPage.tsx'), 'utf8');
    const debut = page.indexOf('const peutPorterCapital');
    expect(debut).toBeGreaterThan(-1);
    const instruction = page.slice(debut, page.indexOf(';', debut) + 1);
    expect(instruction).toContain('FORMES_PERSONNES_PHYSIQUES.includes(');
  });
});
