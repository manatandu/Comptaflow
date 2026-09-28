import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';

// AUCUN import de « vitest » (globales) · convention du dépôt, le fichier est
// exécuté par les DEUX lanceurs.

/**
 * AUDIT FINAL F242 · l'en-tête du tableau des utilisateurs portait six
 * cellules pour une grille de cinq colonnes (« STATUT » deux fois). Rien ne
 * tombe · la sixième cellule passe à la ligne, l'en-tête glisse d'un cran, et
 * la colonne des mots de passe se dit vide sur un écran qui a l'air fini.
 *
 * CE QUE LE SPEC RELIT, et comment. La SOURCE est analysée par le compilateur
 * TypeScript, jamais par une distance en caractères (CLAUDE.md § 10) : pour
 * chaque grille à colonnes figées (`grid-cols-[a_b_c]`), les ENFANTS DIRECTS
 * de l'élément sont comptés (un élément, un fragment ou une expression non
 * vide valent une cellule ; un commentaire JSX n'en vaut aucune) et confrontés
 * au nombre de colonnes. Deux sortes de grilles sont tenues · l'EN-TÊTE, qui
 * porte le fond du chrome (`bg-chrome`), et la LIGNE d'une liste, qui porte
 * une `key`. Une grille de formulaire à deux colonnes, qui s'enroule sur
 * plusieurs rangs, n'est ni l'une ni l'autre et n'est pas relue.
 *
 * Les constantes de chaîne du fichier sont substituées dans l'attribut, comme
 * dans `grilles-fixes-etroites.spec.ts` · la fenêtre Rappel et relevé range
 * sa grille dans une constante.
 */

const PAGES = ['UtilisateursPage.tsx', 'RelancesPage.tsx', 'PlateformePage.tsx', 'CourrierPage.tsx'];

interface Grille {
  ligne: number;
  colonnes: number;
  cellules: number;
  sorte: 'en-tête' | 'ligne';
}

function constantesDe(sf: ts.SourceFile): Map<string, string> {
  const table = new Map<string, string>();
  const visiter = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const v = n.initializer;
      if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) table.set(n.name.getText(), v.text);
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return table;
}

function grillesDe(fichier: string): Grille[] {
  const source = readFileSync(join(__dirname, fichier), 'utf8');
  const sf = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const constantes = constantesDe(sf);
  const grilles: Grille[] = [];
  const visiter = (n: ts.Node): void => {
    if (ts.isJsxElement(n)) {
      let classe: string | null = null;
      let avecCle = false;
      for (const a of n.openingElement.attributes.properties) {
        if (!ts.isJsxAttribute(a)) continue;
        const nom = a.name.getText();
        if (nom === 'key') avecCle = true;
        if (nom === 'className' && a.initializer) {
          classe = a.initializer
            .getText()
            .replace(/\$\{([A-Za-z_$][\w$]*)\}/g, (entier, id: string) => constantes.get(id) ?? entier);
        }
      }
      const gabarit = classe?.match(/(?:^|[\s'"`])grid-cols-\[([^\]]+)\]/);
      const enTete = classe !== null && /(?:^|[\s'"`])bg-chrome(?:-alt)?(?:[\s'"`]|$)/.test(classe);
      if (gabarit && (enTete || avecCle)) {
        const cellules = n.children.filter(
          (c) =>
            ts.isJsxElement(c) ||
            ts.isJsxSelfClosingElement(c) ||
            ts.isJsxFragment(c) ||
            (ts.isJsxExpression(c) && c.expression !== undefined) ||
            (ts.isJsxText(c) && c.text.trim().length > 0),
        ).length;
        grilles.push({
          ligne: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
          colonnes: gabarit[1].split('_').length,
          cellules,
          sorte: enTete ? 'en-tête' : 'ligne',
        });
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return grilles;
}

describe('F242 · un en-tête de tableau a autant de cellules que la grille a de colonnes', () => {
  it('le relevé trouve encore un en-tête et une ligne par page · un garde-fou vide ne vérifie rien', () => {
    for (const page of PAGES) {
      const sortes = new Set(grillesDe(page).map((g) => g.sorte));
      expect([page, [...sortes].sort()]).toEqual([page, ['en-tête', 'ligne']]);
    }
  });

  it('aucune grille relue ne porte plus ni moins de cellules que de colonnes', () => {
    const fautes = PAGES.flatMap((page) =>
      grillesDe(page)
        .filter((g) => g.cellules !== g.colonnes)
        .map((g) => `${page}:${g.ligne} · ${g.sorte} de ${g.cellules} cellules pour ${g.colonnes} colonnes`),
    );
    expect(fautes).toEqual([]);
  });

  it('le tableau des utilisateurs · cinq colonnes, cinq cellules d’en-tête, « Statut » une seule fois', () => {
    const [enTete] = grillesDe('UtilisateursPage.tsx').filter((g) => g.sorte === 'en-tête');
    expect(enTete).toMatchObject({ colonnes: 5, cellules: 5 });
    const source = readFileSync(join(__dirname, 'UtilisateursPage.tsx'), 'utf8');
    expect(source.match(/<span>Statut<\/span>/g)).toHaveLength(1);
  });
});
