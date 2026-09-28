import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * CODE ACTIVITÉ PRINCIPALE À L'ÉCRAN (passe R3) · AUDCIF Titre IX ch. 6,
 * NOTE 36. Le champ ne vit qu'au SYSCOHADA (le serveur le refuse ailleurs),
 * propose les 44 groupes SERVIS par le serveur plutôt qu'une copie de la
 * liste, et rend l'avertissement d'un groupe hors liste.
 */

const page = readFileSync(join(__dirname, 'ParametresDossierPage.tsx'), 'utf8');

/** La balise <input> qui porte cette étiquette, ancrée sur la balise elle-même. */
const caseDe = (etiquette: string) => {
  const i = page.indexOf(`aria-label="${etiquette}"`);
  expect(i).toBeGreaterThan(-1);
  return page.slice(page.lastIndexOf('<input', i), page.indexOf('/>', i));
};

/** Le bloc JSX ouvert par la condition qui précède la case, jusqu'à sa fermeture. */
const blocDe = (etiquette: string) => {
  const i = page.indexOf(`aria-label="${etiquette}"`);
  const debut = page.lastIndexOf("{params?.referentiel === 'SYSCOHADA' && (", i);
  expect(debut).toBeGreaterThan(-1);
  const fin = page.indexOf('</Ligne>', i);
  return page.slice(debut, fin);
};

describe('code activité principale dans Paramètres du dossier', () => {
  it('la case vit sous la condition SYSCOHADA, réservée à l’administrateur', () => {
    const bloc = blocDe('Code activité principale');
    expect(bloc).toContain('aria-label="Code activité principale"');
    expect(caseDe('Code activité principale')).toContain('disabled={!estAdmin || envoi}');
  });

  it('les groupes proposés sont ceux que le serveur sert, jamais une copie', () => {
    expect(caseDe('Code activité principale')).toContain('list="groupes-activites-note-36"');
    const bloc = blocDe('Code activité principale');
    expect(bloc).toContain('<datalist id="groupes-activites-note-36">');
    expect(bloc).toContain('params.groupesActivites.map(');
  });

  it('l’avertissement du serveur est rendu, et l’explication va dans la bulle', () => {
    const bloc = blocDe('Code activité principale');
    expect(bloc).toContain('{params.avertissementCodeActivitePrincipale && (');
    expect(bloc).toContain('>{params.avertissementCodeActivitePrincipale}</div>');
    expect(bloc).toContain('titre="Code activité principale"');
    expect(bloc).toContain('NOTE 36');
  });

  it('le champ n’est envoyé que depuis un dossier SYSCOHADA', () => {
    expect(page).toContain("...(params?.referentiel === 'SYSCOHADA' ? { codeActivitePrincipale: codeActivite } : {})");
  });
});
