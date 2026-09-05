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

/**
 * LES CONSTANTES DU FICHIER, RÉSOLUES · sans quoi ce relevé ne voyait qu'une
 * partie du parc.
 *
 * Beaucoup de pages rangent leur grille dans une constante et la réemploient
 * sur l'en-tête, les lignes et le pied :
 *
 *     const grille = 'grid grid-cols-[28px_110px_1fr] gap-2';
 *     <div className={`${grille} px-3 py-1.5`}>
 *
 * L'attribut ne porte alors PAS le motif `grid-cols-[`, la grille n'était pas
 * comptée, et la page sortait du relevé entière. Trois pages ont vécu ainsi
 * jusqu'au 2026-09-05 (Relances, Brouillard, Journal d'audit), chacune
 * ROGNANT sa dernière colonne sans aucune barre pour aller la chercher · le
 * garde-fou passait au vert sur chacune.
 *
 * On relève donc les constantes de chaîne du fichier et on les substitue dans
 * le texte de l'attribut avant de le lire. Deux limites assumées, et sans
 * conséquence sur la sûreté du relevé : la portée n'est pas suivie (deux
 * constantes homonymes dans un même fichier se confondraient, ce que le dépôt
 * ne fait pas), et une grille composée à l'exécution (une classe choisie par
 * un ternaire) reste hors de portée. Dans les deux cas la substitution échoue
 * et l'on retombe sur le comportement d'avant : ce relevé ne devient jamais
 * plus permissif qu'il ne l'était.
 */
function constantesDe(sf: ts.SourceFile): Map<string, string> {
  const table = new Map<string, string>();
  const visiter = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && ts.isIdentifier(n.name) && n.initializer) {
      const v = n.initializer;
      if (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) {
        table.set(n.name.getText(), v.text);
      }
    }
    ts.forEachChild(n, visiter);
  };
  visiter(sf);
  return table;
}

/** Remplace `${nom}` par la valeur de la constante, en cascade et sans boucler. */
function substituer(texte: string, constantes: Map<string, string>): string {
  let sortie = texte;
  for (let passe = 0; passe < 3; passe += 1) {
    const avant = sortie;
    sortie = sortie.replace(/\$\{([A-Za-z_$][\w$]*)\}/g, (entier, nom) =>
      constantes.has(nom) ? constantes.get(nom)! : entier,
    );
    if (sortie === avant) break;
  }
  return sortie;
}

function classe(
  balise: ts.JsxOpeningElement | ts.JsxSelfClosingElement,
  constantes?: Map<string, string>,
): string | null {
  for (const a of balise.attributes.properties) {
    if (ts.isJsxAttribute(a) && a.name.getText() === 'className' && a.initializer) {
      const brut = a.initializer.getText().replace(/\s+/g, ' ');
      return constantes ? substituer(brut, constantes) : brut;
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
  // Le nombre de PISTES, qui n'est pas celui des termes : `repeat(6,92px)`
  // s'écrit en un terme et vaut six colonnes, donc cinq gouttières de plus.
  let pistes = 0;
  for (const c of colonnes) {
    // `repeat(6,92px)` · la balance du journal l'emploie, et il n'était compté
    // NI en largeur NI en gouttières · 552 px passaient sous le relevé.
    const repetition = c.match(/^repeat\((\d+),\s*(\d+)px\)$/);
    if (repetition) {
      px += Number(repetition[1]) * Number(repetition[2]);
      pistes += Number(repetition[1]);
      continue;
    }
    pistes += 1;
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
    (gouttiere ? ESPACEMENT[gouttiere[1]] ?? 0 : 0) * (pistes - 1) +
    (marge ? (ESPACEMENT[marge[1]] ?? 0) * 2 : 0);
  return minimum ? Math.max(total, Number(minimum[1])) : total;
}

function grillesDe(page: string): Grille[] {
  const source = readFileSync(join(PAGES, page), 'utf8');
  const sf = ts.createSourceFile(page, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const constantes = constantesDe(sf);

  // Les enveloppes du fichier · `const bloc = (…) => <div class="… overflow-x-auto">`
  // (EtatsSmtSyscohadaPage). Une grille passée en ARGUMENT à `bloc` est
  // couverte, alors que rien dans sa chaîne d'ancêtres syntaxiques ne le dit.
  const enveloppes = new Set<string>();
  // Les fabriques de lignes · `const ligneBilan = (p) => <div class="grid …">`.
  // La grille est là, mais le conteneur est chez CHACUN de ses appelants.
  const fabriques = new Map<string, ts.Node>();
  /**
   * Une fabrique s'écrit de deux façons, et la seconde échappait au relevé :
   *
   *     const ligne = (l) => <div className={`${COLONNES} …`}>…       // corps direct
   *     const ligne = (l) => { const x = …; return (<div className=…>) } // corps de bloc
   *
   * La forme à corps de bloc est celle des quatre fabriques de
   * EtatsFinanciersSyscohadaPage, dont les appelants vivent pourtant tous
   * sous un `overflow-x-auto` : le relevé les dénonçait à tort. Un relevé
   * qui accuse un écran déjà correct est aussi nuisible qu'un relevé qui en
   * laisse passer un mauvais · à la troisième fois, on le corrige sans le
   * lire.
   */
  const grilleDansLeCorps = (fn: ts.ArrowFunction | ts.FunctionExpression): boolean => {
    let trouvee = false;
    const chercher = (n: ts.Node): void => {
      if (trouvee) return;
      const balise = baliseDe(n);
      if (balise) {
        const cls = classe(balise, constantes);
        if (cls && cls.includes('grid-cols-[')) trouvee = true;
      }
      ts.forEachChild(n, chercher);
    };
    chercher(fn.body);
    return trouvee;
  };

  const releverDeclarations = (n: ts.Node): void => {
    if (ts.isVariableDeclaration(n) && n.initializer && ts.isArrowFunction(n.initializer)) {
      let corps: ts.Node = n.initializer.body;
      if (ts.isParenthesizedExpression(corps)) corps = corps.expression;
      const balise = baliseDe(corps);
      if (balise) {
        const cls = classe(balise, constantes);
        if (cls && DEFILE.test(cls)) enveloppes.add(n.name.getText());
      }
      if (grilleDansLeCorps(n.initializer)) fabriques.set(n.name.getText(), n);
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
        const cls = classe(balise, constantes);
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
      const cls = classe(balise, constantes);
      if (cls && cls.includes('grid-cols-[')) {
        // Une grille qui retombe sur une colonne unique sous son point de
        // rupture (`grid-cols-1 lg:grid-cols-[…]`) s'empile au lieu de
        // déborder : elle n'a besoin d'aucun conteneur.
        const empilable = /grid-cols-1\b/.test(cls) && /(sm|md|lg|xl):grid-cols-\[/.test(cls);
        // La fabrique LA PLUS INTERNE, mesurée par l'étendue de sa
        // déclaration · le composant de la page est lui-même une fonction qui
        // contient des grilles, et le prendre pour la fabrique d'une ligne
        // ferait dépendre la couverture d'appels qui n'existent pas.
        let fabrique: string | null = null;
        let etendue = Number.POSITIVE_INFINITY;
        for (const [nom, decl] of fabriques) {
          if (!estDans(n, decl)) continue;
          const taille = decl.getEnd() - decl.getStart();
          if (taille < etendue) {
            etendue = taille;
            fabrique = nom;
          }
        }
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

  it('le relevé SUIT les grilles rangées dans une constante', () => {
    // LE TROU QUE CE TEST FERME · l'analyse lisait le texte brut de
    // l'attribut. Pour `className={`${grille} px-3`}` ce texte ne contient pas
    // `grid-cols-[`, la grille n'était pas comptée, et la page sortait du
    // relevé ENTIÈRE. Sept écrans ont vécu ainsi (Relances, Brouillard,
    // Journal d'audit, Balance auxiliaire, les deux onglets du Journal,
    // Lettrage), tous rognant leur dernière colonne, tous au vert ici.
    //
    // On mesure ce que le relevé VOIT, pas ce qu'il conclut : le compte de
    // grilles d'une page dont la grille est en constante doit être non nul.
    const enConstante = ['RelancesPage.tsx', 'BrouillardPage.tsx', 'LettragePage.tsx'];
    for (const page of enConstante) {
      const vues = TOUTES.filter((g) => g.page === page);
      expect([page, vues.length > 0]).toEqual([page, true]);
      // et elles sont mesurées, pas comptées à zéro faute de savoir les lire.
      expect([page, vues.some((g) => g.largeur > UTILE)]).toEqual([page, true]);
    }
  });

  it('le relevé compte les colonnes écrites en `repeat(n, Xpx)`', () => {
    // Second angle mort de la mesure · `repeat(6,92px)` est UN terme et vaut
    // SIX colonnes. Non lu, il retirait 552 px de largeur et cinq gouttières
    // à la balance du journal, qui passait pour étroite.
    expect(largeurIncompressible('grid-cols-[80px_1fr_repeat(6,92px)] gap-2 px-3.5')).toBe(716);
    // Sans la lecture des `repeat`, le même calcul donnait 108 px.
    expect(largeurIncompressible('grid-cols-[repeat(3,100px)]')).toBe(300);
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

  it("ne dénonce PAS une fabrique à corps de bloc dont les appelants sont couverts", () => {
    // EtatsFinanciersSyscohadaPage écrit ses quatre fabriques de lignes avec
    // un corps de bloc (`=> { … return (<div className={`${COLONNES} …`}>) }`)
    // et rend chacune sous un `overflow-x-auto`. Un relevé qui les accuse est
    // aussi nuisible qu'un relevé qui laisse passer un mauvais écran : à la
    // troisième fois, on le corrige sans le lire.
    const accusees = TOUTES.filter(
      (g) => g.page === 'EtatsFinanciersSyscohadaPage.tsx' && g.largeur > UTILE && !g.couverte,
    );
    expect(accusees).toEqual([]);
    // Garde-fou du garde-fou · elles sont bien VUES, et larges.
    const vues = TOUTES.filter((g) => g.page === 'EtatsFinanciersSyscohadaPage.tsx' && g.largeur > UTILE);
    expect(vues.length).toBeGreaterThan(0);
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

  it('la balance auxiliaire rend ses six colonnes de montants atteignables', () => {
    // 814 px de colonnes + 8 gouttières de 10 px + 28 px = 922 px, la plus
    // large grille du logiciel après le journal général. Elle était invisible
    // du relevé parce que rangée dans une constante.
    const src = lire('BalanceAuxiliairePage.tsx');
    expect(src).toMatch(/border border-border bg-surface shadow-posee overflow-x-auto/);
    expect(src).toMatch(/grid-cols-\[92px_86px_1fr_106px_106px_106px_106px_106px_106px\] min-w-\[922px\]/);
  });

  it('les deux autres onglets du journal ont enfin le conteneur du premier', () => {
    // La vague précédente avait servi l'onglet JOURNAL GÉNÉRAL et laissé le
    // GRAND LIVRE (588 px) et la BALANCE (716 px) de côté : leurs grilles
    // vivaient dans des constantes de module.
    const src = lire('JournalPage.tsx');
    expect(src).toMatch(/grid-cols-\[66px_40px_54px_1\.8fr_92px_92px_98px_54px_1fr\] min-w-\[588px\]/);
    expect(src).toMatch(/grid-cols-\[80px_1fr_repeat\(6,92px\)\] min-w-\[716px\]/);
    expect(src).toMatch(/onglet === 'grand-livre' && \(\s*\n\s*<div className="border border-border overflow-x-auto">/);
    expect(src).toMatch(/rounded-t-none overflow-x-auto/);
  });

  it("le lettrage garde sa colonne LETTRE et son solde atteignables", () => {
    // Le panneau ne débordait pas, il COUPAIT · `max-w-[1040px]` sans
    // `overflow`, exactement la forme décrite plus haut pour les quatre
    // panneaux qui rognaient. Le `min-w` compte autant que le conteneur : sans
    // lui, l'en-tête et les lignes se calent chacun sur leur propre contenu et
    // les titres glissent d'une colonne dès qu'on fait défiler.
    const src = lire('LettragePage.tsx');
    expect(src).toMatch(/max-w-\[1040px\] overflow-x-auto/);
    expect(src).toMatch(/grid-cols-\[26px_70px_46px_1\.3fr_96px_96px_100px_78px\] min-w-\[610px\]/);
    expect(src).toMatch(/grid-cols-\[92px_1\.3fr_54px_110px_60px_110px_140px\] min-w-\[654px\]/);
  });

  it('les trois écrans à grille en constante corrigés le 2026-09-05 gardent leur largeur', () => {
    // Relances, Brouillard et Journal d'audit · même cause, même remède, et
    // c'est leur découverte qui a motivé la résolution des constantes ici.
    expect(lire('RelancesPage.tsx')).toMatch(/min-w-\[690px\]/);
    expect(lire('BrouillardPage.tsx')).toMatch(/min-w-\[744px\]/);
    expect(lire('JournalAuditPage.tsx')).toMatch(/min-w-\[522px\]/);
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
