import { readFileSync } from 'fs';
import { join } from 'path';

// Pas d'import de « vitest » · convention du dépôt (voir calcul.spec.ts).

/**
 * LA FENÊTRE DEVISES, TELLE QUE LE GESTIONNAIRE DE PAIE LA VOIT (audit final
 * F247). Le serveur lui ouvre la lecture des devises et la cotation du cours
 * de l'USD du jour, et lui ferme le reste du module · l'écran ne doit donc ni
 * lire ce qui lui est refusé (la liste des réévaluations, dont le refus
 * s'afficherait en erreur à l'ouverture), ni lui proposer la réévaluation, ni
 * envoyer une autre date que celle du jour.
 *
 * Lu sur la SOURCE, faute de monter React dans ces tests · chaque propriété
 * est cherchée dans le bloc qui la porte (corps de fonction, formulaire),
 * jamais à une distance de caractères.
 */

const source = readFileSync(join(__dirname, 'DevisesPage.tsx'), 'utf8');

/** Le corps d'une fonction fléchée `const nom = async (…) => { … }`, par équilibrage des accolades. */
function corps(nom: string): string {
  const debut = source.indexOf(`const ${nom} = async`);
  expect([nom, debut >= 0]).toEqual([nom, true]);
  const ouvrante = source.indexOf('{', source.indexOf('=>', debut));
  let profondeur = 0;
  for (let i = ouvrante; i < source.length; i++) {
    if (source[i] === '{') profondeur++;
    if (source[i] === '}' && --profondeur === 0) return source.slice(ouvrante, i + 1);
  }
  throw new Error(`corps de ${nom} non refermé`);
}

/** Le formulaire de cotation, de sa balise ouvrante à sa balise fermante. */
function formulaireDeCotation(): string {
  const debut = source.indexOf('<form onSubmit={poserCours}');
  expect(debut).toBeGreaterThan(0);
  return source.slice(debut, source.indexOf('</form>', debut));
}

describe('Devises · ce que le gestionnaire de paie voit et envoie', () => {
  it('la page lit la règle du rôle, au lieu de la réécrire', () => {
    expect(source).toContain('const coursDuJourSeul = cotationBorneeAuCoursDuJour(utilisateur?.role);');
    expect(source).toContain('const jourDuCours = jourDeKinshasaIso(new Date());');
  });

  it('elle ne lui demande pas la liste des réévaluations, que le serveur lui refuse', () => {
    expect(corps('charger')).toMatch(/exerciceCourant && !coursDuJourSeul\s*\?\s*api\.get<Reevaluation\[\]>\(/);
  });

  it('la réévaluation ne lui est pas proposée', () => {
    expect(source).toContain('{!coursDuJourSeul && (reevaluationServie || reevaluations.length > 0) && (');
  });

  it('la cotation ne lui propose que l’USD, à la date du jour, et c’est cette date qui part', () => {
    expect(source).toMatch(
      /const devisesCotables =\s*devises === null \? \[\] : coursDuJourSeul \? devises\.filter\(\(d\) => d\.code === DEVISE_COTEE_PAR_LA_PAIE\) : devises;/,
    );
    const formulaire = formulaireDeCotation();
    expect(formulaire).toContain('devisesCotables.map((d) => (');
    expect(formulaire).toContain('value={coursDuJourSeul ? jourDuCours : dateCours}');
    expect(formulaire).toContain('readOnly={coursDuJourSeul}');
    expect(corps('poserCours')).toContain('date: coursDuJourSeul ? jourDuCours : dateCours,');
  });

  it('le cours du jour déjà coté ne lui est pas proposé à la réécriture, et il le lit (relecture adverse)', () => {
    // Le serveur refuse au gestionnaire de réécrire un cours déjà coté ·
    // l'écran compare à l'instant, comme la clé (devise, date) du serveur.
    expect(source).toMatch(
      /const coursDuJourDejaCote = coursDuJourSeul\s*\?\s*\(devisesCotables\.flatMap\(\(d\) => d\.cours\)\.find\(\(c\) => Date\.parse\(c\.date\) === Date\.parse\(jourDuCours\)\) \?\? null\)\s*:\s*null;/,
    );
    expect(source).toContain('{peutEcrire && devisesCotables.length > 0 && !coursDuJourDejaCote && (\n            <form onSubmit={poserCours}');
    expect(source).toContain('{coursDuJourDejaCote && (');
  });

  it('sans devise USD au dossier, il le lit, au lieu d’un formulaire absent', () => {
    expect(source).toContain('{coursDuJourSeul && devises !== null && devisesCotables.length === 0 && (');
  });

  it('« Aucune devise » ne se dit que d’une liste lue', () => {
    expect(source).toContain('useState<Devise[] | null>(null)');
    expect(source).toContain('{devises !== null && devises.length === 0 && (');
  });
});
