import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * LE DOUBLE REGARD DOIT ATTEINDRE UN ÉCRAN, ET DIRE LA VÉRITÉ.
 *
 * Le refus vit dans le service. Sans écran, l'utilisateur le découvrirait par
 * un compteur à zéro, sans jamais savoir pourquoi · et dans le pire cas par
 * une phrase FAUSSE, l'ancien « Rien à valider jusqu'à cette date. » servi dès
 * que `validees` valait zéro. Avec le double regard, c'est le mensonge le plus
 * exact possible : le brouillard est plein, il vient d'être refusé en entier,
 * et l'écran annonce qu'il est vide. Le comptable croit sa période
 * centralisée, l'AUDCIF art. 22, 2° la veut faite « au terme de chaque période
 * qui ne peut excéder un mois », et rien ne le détrompe avant la clôture.
 */

const brouillard = readFileSync(join(__dirname, 'BrouillardPage.tsx'), 'utf8');
const parametres = readFileSync(join(__dirname, 'ParametresDossierPage.tsx'), 'utf8');
const types = readFileSync(join(__dirname, '../lib/types.ts'), 'utf8');

describe('le brouillard rend compte des écartées', () => {
  it('les deux appels lisent le type NOMMÉ, pas un objet anonyme', () => {
    // Un objet anonyme par appel laisse l'un des deux oublier un compteur.
    expect(brouillard).toContain("api.post<ResultatValidation>('/ecritures/valider'");
    expect(brouillard).toContain("api.post<ResultatValidation>('/ecritures/valider-jusqua'");
    expect(brouillard).not.toContain('{ validees: number; dejaValidees: number }');
  });

  it('le compteur des écartées passe AVANT le cas vide', () => {
    // L'ordre est la correction : tester `validees === 0` d'abord ferait
    // réapparaître « Rien à valider » sur un lot entièrement refusé.
    const i = brouillard.indexOf('const phraseValidation');
    expect(i).toBeGreaterThan(0);
    const corps = brouillard.slice(i, i + 900);
    expect(corps.indexOf('refuseesSecondRegard > 0')).toBeLessThan(corps.indexOf('r.validees === 0'));
  });

  it('la phrase servie porte le motif sourcé, pas seulement un nombre', () => {
    const i = brouillard.indexOf('const phraseValidation');
    expect(brouillard.slice(i, i + 900)).toContain('r.motifRefus');
  });
});

describe("l'option se règle, et l'écran dit qu'aucun texte ne l'impose", () => {
  it('la case est branchée sur la route dédiée', () => {
    expect(parametres).toContain("api.patch<ParametresDossier>('/dossier/double-regard'");
    expect(parametres).toContain('checked={params.doubleRegardValidation}');
  });

  it("le texte dit AUCUN TEXTE N'IMPOSE · sans quoi la case se lit comme une obligation", () => {
    expect(parametres).toContain('AUCUN TEXTE N’IMPOSE');
  });

  it('chaque référentiel est renvoyé à SON article, jamais à celui de l’autre', () => {
    const i = parametres.indexOf('Double regard à la validation');
    expect(i).toBeGreaterThan(0);
    const bloc = parametres.slice(i, i + 2600);
    expect(bloc).toContain('art. 16, 2)');
    expect(bloc).toContain('art. 69');
    expect(bloc).toContain('exclu par l’art. 3');
    // La centralisation d'un dossier SYCEBNL est HEBDOMADAIRE · servir
    // « mensuelle » ou l'art. 19 ici referait la transposition déjà corrigée.
    expect(bloc).not.toContain('art. 19');
    expect(bloc).not.toContain('mensuel');
  });

  it("l'option n'est PAS présentée comme propre au SYCEBNL", () => {
    // `doubleRegardValidation` est non nullable dans le contrat client,
    // contrairement aux champs qui passent par `siSycebnl()`.
    expect(types).toContain('doubleRegardValidation: boolean;');
    expect(types).not.toContain('doubleRegardValidation: boolean | null');
  });

  it('le contrat de validation porte les cinq compteurs', () => {
    const i = types.indexOf('export type ResultatValidation');
    expect(i).toBeGreaterThan(0);
    const bloc = types.slice(i, i + 700);
    for (const champ of ['validees', 'dejaValidees', 'refuseesSecondRegard', 'sousDerogation', 'motifRefus']) {
      expect(bloc).toContain(champ);
    }
  });
});
