import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Aucun import de « vitest » (globales) · convention du dépôt.

/**
 * AUDIT FINAL F175 · la fenêtre Utilisateurs avalait le refus du serveur sur
 * deux actions sur trois. Depuis F157, rétrograder le dernier administrateur
 * actif est REFUSÉ · sans `catch`, le refus partait en promesse rejetée et
 * l'écran ne disait rien, le sélecteur revenant seul à l'ancien rôle.
 *
 * Le corps de chaque action est découpé par équilibrage des accolades, jamais
 * par une distance en caractères (CLAUDE.md § 10).
 */
const source = readFileSync(join(__dirname, 'UtilisateursPage.tsx'), 'utf8');

function corps(nom: string): string {
  const debut = source.indexOf(`const ${nom} = async`);
  expect(debut).toBeGreaterThan(-1);
  const ouvrante = source.indexOf('{', source.indexOf('=>', debut));
  let profondeur = 0;
  for (let i = ouvrante; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    if (source[i] === '}' && --profondeur === 0) return source.slice(ouvrante, i + 1);
  }
  throw new Error(`corps de ${nom} introuvable`);
}

describe('fenêtre Utilisateurs · chaque action dit le refus du serveur', () => {
  for (const action of ['deverrouiller', 'changerRole', 'basculerActif']) {
    it(`${action} rattrape l’erreur et l’affiche`, () => {
      const c = corps(action);
      expect(c).toContain('catch (err)');
      expect(c).toContain('setErreurChargement(err instanceof ApiError ? err.message :');
    });
  }
});
