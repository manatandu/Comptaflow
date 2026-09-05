import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as ts from 'typescript';

// AUCUN import de « vitest » ici, volontairement · même raison que
// chrome-etroit.spec.ts : describe/it/expect arrivent par les globales, ce qui
// rend le fichier exécutable par les DEUX lanceurs, et le jest de la racine
// ramasse aussi client/src (clé `roots` de package.json).

/**
 * LE DÉBORDEMENT HORIZONTAL DES PAGES À GRILLE FIXE.
 *
 * Le dépôt compose ses tableaux en grilles CSS à colonnes de largeur figée
 * (`grid-cols-[110px_1fr_140px_140px_150px]`). Une telle grille ne se comprime
 * pas : sous la largeur de ses colonnes elle DÉBORDE de sa boîte, et le
 * débordement remonte jusqu'au premier ancêtre qui défile. Dans OmegaX cet
 * ancêtre est le contenu de la fenêtre (`flex-1 min-h-0 overflow-auto`,
 * Fenetre.tsx) ou le fond de l'espace de travail (`absolute inset-0
 * overflow-auto`, AppShell.tsx) : la PAGE ENTIÈRE se met alors à défiler de
 * côté, et l'en-tête de l'état, ses onglets et ses boutons d'export s'en vont
 * avec elle · on ne peut plus exporter ce qu'on est en train de lire.
 *
 * LA LARGEUR DE RÉFÉRENCE, 326 px. À 360 px d'écran, une fenêtre restaurée
 * mesure `min(940px, calc(100% - 16px))` et une fenêtre agrandie
 * `inset: 8px`, soit 344 px dans les deux cas (Fenetre.tsx) ; ôtés les 2 px de
 * bordure et les 16 px du `p-2` que porte la racine de chaque page, il reste
 * 326 px au tableau.
 *
 * CE QUE MESURE CE SPEC. Aucun rendu : le dépôt n'embarque ni jsdom ni
 * navigateur, et jsdom ne calculerait de toute façon aucune mise en page. On
 * relit donc la SOURCE de chaque page, on additionne ce qui, dans une grille,
 * est INCOMPRESSIBLE (colonnes en px, bornes basses des `minmax`, gouttières,
 * marges horizontales) et on vérifie qu'au-delà de 326 px la grille vit sous
 * un conteneur qui défile. Les colonnes `fr` comptent pour zéro : la somme est
 * une borne BASSE, donc tout dépassement qu'elle signale est certain, quel que
 * soit le contenu des cellules.
 *
 * Relevé du 2026-09-05 : 26 pages portaient une grille large sans aucun
 * ancêtre défilant, de 346 px (Bailleurs) à 868 px (Immobilisations).
 */

const PAGES = join(__dirname);

/**
 * CSS Overflow 3 : « if one [axe] is specified as visible and the other is
 * not, then visible computes to auto ». Un ancêtre en `overflow-y-auto` défile
 * donc AUSSI horizontalement · sans cette règle on envelopperait une seconde
 * fois des tableaux déjà défilants (les listes bornées en hauteur de
 * ControlesPage, la balance en lecture de GroupePage).
 */
const DEFILE = /overflow-(x-|y-)?(auto|scroll)/;

/** Échelle d'espacement Tailwind employée dans le dépôt, en pixels. */
const ESPACEMENT: Record<string, number> = {
  '1': 4,
  '1.5': 6,
  '2': 8,
  '2.5': 10,
  '3': 12,
  '3.5': 14,
  '4': 16,
  '5': 20,
  '6': 24,
};

/** Largeur utile d'un tableau dans une fenêtre ouverte sur un écran de 360 px. */
const UTILE = 326;

interface Grille {
  page: string;
  ligne: number;
  largeur: number;
  couverte: boolean;
}

function classe(balise: ts.JsxOpeningElement | ts.JsxSelfClosingElement): string | null {
  for (const a of balise.attributes.properties) {
    if (ts.isJsxAttribute(a) && a.name.getText() === 'className' && a.initializer) {
      return a.initializer.getText().replace(/\s+/g, ' ');
    }
  }
  return null;
}

const baliseDe = (n: ts.Node): ts.JsxOpeningElement | ts.JsxSelfClosingElement | null =>
  ts.isJsxElement(n) ? n.openingElement : ts.isJsxSelfClosingElement(n) ? n : null;

/**
 * Ce qu'une grille réclame quoi qu'il arrive : ses colonnes en pixels, la
 * borne basse de ses `minmax`, ses gouttières et ses marges gauche/droite. Un
 * `min-w-[…]` déjà posé l'emporte s'il est plus grand · c'est lui qui décide
 * alors de la largeur de la boîte.
 */
function largeurIncompressible(cls: string): number {
  const m = cls.match(/grid-cols-\[([^\]]+)\]/);
  if (!m) return 0;
  const colonnes = m[1].split('_');
  let px = 0;
  for (const c of colonnes) {
    const borne = c.match(/minmax\((\d+)px/);
    if (borne) {
      px += Number(borne[1]);
      continue;
    }
    const fixe = c.match(/^(\d+)px$/);
    if (fixe) px += Number(fixe[1]);
  }
  const gouttiere = cls.match(/(?:^|[\s`'"])gap-(?:x-)?([\d.]+)/);
  const marge = cls.match(/(?:^|[\s`'"])px-([\d.]+)/);
  const minimum = cls.match(/min-w-\[(\d+)px\]/);
  const total =
    px +
    (gouttiere ? ESPACEMENT[gouttiere[1]] ?? 0 : 0) * (colonnes.length - 1) +
    (marge ? (ESPACEMENT[marge[1]] ?? 0) * 2 : 0);
  return minimum ? Math.max(total, Number(minimum[1])) : total;
}

function grillesDe(page: string): Grille[] {
  const source = readFileSync(join(PAGES, page), 'utf8');
  const sf = ts.createSourceFile(page, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  // Les enveloppes du fichier · `const bloc = (…) => <div class="… overflow-x-auto">`
  // (EtatsSmtSyscohadaPage). Une grille passée en ARGUMENT à `bloc` est
  // couverte, alors que rien dans sa chaîne d'ancêtres syntaxiques ne le dit.
  const enveloppes = new Set<string>();
  // Les fabriques de lignes · `const ligneBilan = (p) => <div class="grid …">`.
  // La grille est là, mais le conteneur est chez CHACUN de ses appelants.
  const fabriques = new Map<string, ts.Node>();
  const releverDeclarations = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isArrowFunction(n.initializer)) {
      let corps: ts.Node = n.initializer.body;
      if (ts.isParenthesizedExpression(corps)) corps = corps.expression;
      const balise = baliseDe(corps);
      if (balise) {
        const cls = classe(balise);
        if (cls && DEFILE.test(cls)) enveloppes.add(n.name.getText());
        if (cls && cls.includes('grid-cols-[')) fabriques.set(n.name.getText(), n);
      }
    }
    ts.forEachChild(n, releverDeclarations);
  };
  releverDeclarations(sf);

  /** Un ancêtre de `depart` défile-t-il ? */
  const sousUnDefilement = (depart: ts.Node): boolean => {
    let p: ts.Node | undefined = depart.parent;
    while (p) {
      const balise = baliseDe(p);
      if (balise) {
        const cls = classe(balise);
        if (cls && DEFILE.test(cls)) return true;
      }
      if (ts.isCallExpression(p) && ts.isIdentifier(p.expression) && enveloppes.has(p.expression.getText())) {
        return true;
      }
      p = p.parent;
    }
    return false;
  };

  /**
   * Une fabrique n'est couverte que si TOUS ses appelants le sont · un seul
   * onglet qui la rende hors conteneur suffit à ramener le défaut.
   */
  const fabriqueCouverte = (nom: string): boolean => {
    const declaration = fabriques.get(nom)!;
    let appels = 0;
    let couverts = 0;
    const chercher = (n: ts.Node): void => {
      if (ts.isIdentifier(n) && n.getText() === nom && !estDans(n, declaration)) {
        appels += 1;
        if (sousUnDefilement(n)) couverts += 1;
      }
      ts.forEachChild(n, chercher);
    };
    chercher(sf);
    return appels > 0 && appels === couverts;
  };

  const estDans = (n: ts.Node, racine: ts.Node): boolean => {
    let p: ts.Node | undefined = n;
    while (p) {
      if (p === racine) return true;
      p = p.parent;
    }
    return false;
  };

  const grilles: Grille[] = [];
  const visiter = (n: ts.Node): void => {
    const balise = baliseDe(n);
    if (balise) {
      const cls = classe(balise);
      if (cls && cls.includes('grid-cols-[')) {
        // Une grille qui retombe sur une colonne unique sous son point de
        // rupture (`grid-cols-1 lg:grid-cols-[…]`) s'empile au lieu de
        // déborder : elle n'a besoin d'aucun conteneur.
        const empilable = /grid-cols-1\b/.test(cls) && /(sm|md|lg|xl):grid-cols-\[/.test(cls);
        let fabrique: string | null = null;
        for (const [nom, decl] of fabriques) if (estDans(n, decl)) fabrique = nom;
        grilles.push({
          page,
          ligne: sf.getLineAndCharacterOfPosition(n.getStart()).line + 1,
          largeur: empilable ? 0 : largeurIncompressible(cls),
          couverte: sousUnDefilement(n) || (fabrique !== null && fabriqueCouverte(fabrique)),
        });
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return grilles;
}

const TOUTES = readdirSync(PAGES)
  .filter((f) => f.endsWith('.tsx'))
  .sort()
  .flatMap(grillesDe);

describe('grilles à colonnes fixes sur un écran de 360 px', () => {
  it('le relevé porte sur toutes les pages et trouve bien des grilles à mesurer', () => {
    // Garde-fou du garde-fou · si l'analyse cessait de reconnaître les
    // grilles (renommage d'attribut, changement de balise), la règle suivante
    // passerait sur un ensemble vide et ne protégerait plus rien.
    expect(TOUTES.length).toBeGreaterThan(100);
  });

  it("aucune grille plus large que 326 px ne vit hors d'un conteneur qui défile", () => {
    // LE DÉFAUT : la grille pousse la fenêtre, qui emmène l'en-tête de l'état,
    // ses onglets et ses boutons d'export hors de l'écran, et les colonnes de
    // droite restent inatteignables tant qu'on n'a pas élargi la fenêtre.
    const orphelines = TOUTES.filter((g) => g.largeur > UTILE && !g.couverte).map(
      (g) => `${g.page}:${g.ligne} · ${g.largeur} px`,
    );
    expect(orphelines).toEqual([]);
  });

  it('le défilement horizontal ne remonte jamais au corps de la page', () => {
    // Piège (c) du lot : la solution n'est PAS de laisser déborder plus haut.
    // Une page ne pose donc jamais son propre `overflow-x` sur sa racine · le
    // conteneur se met autour du TABLEAU, au plus près du débordement.
    const racines = readdirSync(PAGES)
      .filter((f) => f.endsWith('.tsx'))
      .filter((f) => /return \(\s*\n\s*<div className="[^"]*overflow-x-(auto|scroll)/.test(readFileSync(join(PAGES, f), 'utf8')));
    expect(racines).toEqual([]);
  });
});

/**
 * QUELQUES ÉCRANS NOMMÉS. La règle ci-dessus est générale ; ces cas-ci portent
 * les mesures qui l'ont motivée, pour qu'une régression désigne un écran et un
 * nombre plutôt qu'une ligne de fichier.
 */
describe('les écrans qui débordaient le plus', () => {
  const lire = (p: string) => readFileSync(join(PAGES, p), 'utf8');

  it('le journal général donne ses neuf colonnes au conteneur, pas à la fenêtre', () => {
    // 722 px de colonnes fixes + 8 gouttières de 10 px + 28 px de marges =
    // 830 px pour 326 disponibles. C'est la plus large grille du logiciel : la
    // page partait de 504 px vers la droite, DATE compris.
    const src = lire('JournalPage.tsx');
    expect(src).toMatch(/className="border border-border bg-surface shadow-posee rounded-t-none overflow-x-auto"/);
    expect(src).toMatch(/grid-cols-\[68px_46px_52px_92px_120px_1fr_108px_108px_128px\] min-w-\[980px\]/);
  });

  it("le registre des immobilisations aussi, avec sa colonne d'amortissement", () => {
    // 770 px de colonnes + 7 × 10 + 28 = 868 px.
    const src = lire('ImmobilisationsPage.tsx');
    expect(src).toMatch(/max-w-\[1180px\] overflow-x-auto/);
    expect(src).toMatch(/grid-cols-\[1\.4fr_110px_100px_100px_100px_100px_90px_170px\] min-w-\[1020px\]/);
  });

  it("le plan de comptes garde son en-tête au-dessus de ses lignes", () => {
    // Défaut d'une autre forme, et la raison du `min-w` : la liste défilait
    // déjà (`flex-1 overflow-auto`) mais la ligne de titres, elle, restait
    // dehors. Dès qu'on poussait la liste vers la droite, INTITULÉ se
    // retrouvait sous N° COMPTE. Les deux portent maintenant la même largeur
    // minimale et défilent ensemble, dans le conteneur du panneau.
    const src = lire('PlanComptesPage.tsx');
    expect(src).toMatch(/flex-1 min-w-0 bg-surface border border-border shadow-posee flex flex-col overflow-x-auto/);
    expect(src).toMatch(/grid-cols-\[92px_1fr_58px_72px_74px\] min-w-\[520px\]/);
    expect(src).toMatch(/className="flex-1 overflow-auto min-w-\[520px\]"/);
  });

  it('la liste des tiers, même forme et même remède', () => {
    const src = lire('TiersPage.tsx');
    expect(src).toMatch(/flex-1 min-w-0 bg-surface border border-border shadow-posee flex flex-col overflow-x-auto/);
    expect(src).toMatch(/grid-cols-\[96px_1fr_150px_86px\] min-w-\[540px\]/);
    expect(src).toMatch(/className="flex-1 overflow-auto min-w-\[540px\]"/);
  });

  it('un panneau qui ROGNAIT ses colonnes les rend maintenant atteignables', () => {
    // `overflow-hidden` empêchait bien la page de partir de côté, mais au prix
    // des colonnes de droite : SOLDE AU SOIR était purement invisible, sans
    // barre de défilement pour aller la chercher. Quatre panneaux étaient dans
    // ce cas (Contrôles, Devises, États analytiques, Régularisations).
    expect(lire('ControlesPage.tsx')).toMatch(/rounded-b-\[10px\] overflow-x-auto/);
    expect(lire('DevisesPage.tsx')).toMatch(/rounded-\[10px\] shadow-posee overflow-x-auto/);
    expect(lire('EtatsAnalytiquesPage.tsx')).toMatch(/rounded-b-\[10px\] overflow-x-auto/);
    expect(lire('RegularisationPage.tsx')).toMatch(/rounded-\[8px\] overflow-x-auto/);
  });

  it("les axes analytiques s'empilent au lieu de pousser la page", () => {
    // Une MISE EN PAGE, pas un tableau : 210 px d'axes + 330 px de fiche +
    // deux gouttières = 560 px avant le moindre caractère du volet central.
    // Un conteneur défilant y ferait glisser toute la page de côté ; le
    // remède est la rupture, comme sur la page des devises et l'import.
    const src = lire('PlansAnalytiquesPage.tsx');
    expect(src).toMatch(/grid grid-cols-1 lg:grid-cols-\[210px_1fr_330px\]/);
  });

  it("le bloc titré du SMT SYSCOHADA reste le modèle du dépôt", () => {
    // C'est de lui que vient la forme généralisée ici · s'il perdait son
    // `overflow-x-auto`, ses vingt-deux tableaux repasseraient tous à la
    // fenêtre d'un coup.
    expect(lire('EtatsSmtSyscohadaPage.tsx')).toMatch(
      /const bloc = \(titre: string, contenu: React\.ReactNode\) => \(\s*\n\s*<div className="border border-border bg-surface mb-3 overflow-x-auto">/,
    );
  });
});
