import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { lignesDuMenu, type LigneMenu, type MenuEntreeDef, type MenuGroupeDef } from './menu-groupes';

// AUCUN import de « vitest » ici, volontairement · c'est la convention du
// dépôt (voir client/vitest.config.ts et calcul.spec.ts) : describe/it/expect
// arrivent par les globales, ce qui rend le fichier exécutable par les DEUX
// lanceurs. Le jest du serveur ramasse aussi client/src (clé `roots` de
// package.json) : importer de vitest y cassait la compilation du spec, donc
// `npx jest` à la racine, que CLAUDE.md §3 exige avant chaque commit.

/**
 * Garde-fous du chrome sur un écran étroit (360 px).
 *
 * Aucun de ces défauts ne lève d'erreur, n'échoue à la compilation ni ne casse
 * un rendu de bureau : ils ne se voient QUE sur un écran étroit, où ils
 * rendaient des commandes matériellement inatteignables. Un test de rendu ne
 * peut pas les attraper · jsdom ne calcule aucune mise en page, et le dépôt
 * n'embarque pas de navigateur. On vérifie donc la CAUSE dans la source :
 * chaque assertion correspond à un défaut mesuré au navigateur le 2026-09-02,
 * et son commentaire dit ce que sa disparition ferait revenir.
 */
const lire = (chemin: string) => readFileSync(join(__dirname, chemin), 'utf8');

describe('chrome à 360 px', () => {
  it("la barre de menus se replie au lieu de pousser l'application de côté", () => {
    const src = lire('MenuBar.tsx');
    // Mesuré : 427 px de titres pour 360 px d'écran. Sans repli, la barre
    // débordait et entraînait TOUTE l'application vers la droite · le nom du
    // dossier et le bouton Déconnexion sortaient de l'écran.
    expect(src).toMatch(/flex flex-wrap items-center/);
    // Une hauteur FIGÉE rognait le second rang : elle doit rester un
    // minimum. On ne teste pas l'absence de l'ancienne classe · les
    // commentaires du fichier la citent pour expliquer l'incident, et une
    // négation la retrouverait dans la prose au lieu du code.
    expect(src).toMatch(/z-40 min-h-\[26px\] flex flex-wrap/);
  });

  it("chaque titre de menu se mesure sur son RANG et non sur la barre", () => {
    const src = lire('MenuBar.tsx');
    // `h-full` vaut 100 % de la BARRE : repliée sur deux rangs de 24 px, elle
    // en faisait 49, et chaque titre réclamait donc 49 px. Le second rang
    // débordait par le bas, jusque sur l'espace de travail.
    expect(src).toMatch(/static sm:relative self-stretch/);
    expect(src).not.toMatch(/static sm:relative h-full/);
  });

  it("un menu déroulé reste dans l'écran", () => {
    const src = lire('MenuBar.tsx');
    // Ancré à son titre, le menu « État » s'ouvrait 103 px hors de l'écran.
    // Sous `sm` il se cale sur la barre et s'étend d'un bord à l'autre.
    expect(src).toMatch(/left-2 right-2 sm:left-0 sm:right-auto/);
  });

  it("la barre d'état borne ses deux libellés au lieu de les laisser déborder", () => {
    const src = lire('StatusBar.tsx');
    // Un élément flex refuse de descendre sous la largeur de son contenu tant
    // qu'il n'a pas `min-w-0` : les deux libellés sortaient de 21 px de la
    // barre et s'imprimaient par-dessus le bord de l'écran.
    expect(src).toMatch(/flex items-center gap-2 min-w-0/);
    expect(src).toMatch(/className="min-w-0 truncate"/);
    expect(src).toMatch(/text-text truncate/);
  });

  it('une fenêtre restaurée est bornée en POSITION, pas seulement en taille', () => {
    const src = lire('Fenetre.tsx');
    // Rétrécie à la largeur de l'espace mais laissée à son `x` de bureau, la
    // fenêtre sortait par la droite · ses boutons Réduire / Agrandir / Fermer
    // devenaient inatteignables, et on ne pouvait pas la rattraper puisque sa
    // barre de titre était hors écran.
    expect(src).toMatch(/left: `clamp\(8px, \$\{fenetre\.cadre\.x\}px/);
    expect(src).toMatch(/top: `clamp\(0px, \$\{fenetre\.cadre\.y\}px/);
  });

  it('la croix de fermeture reste visible là où le survol n\'existe pas', () => {
    const src = lire('BarreFenetres.tsx');
    // `group-hover` ne se déclenche jamais au doigt : la croix restait
    // invisible et le seul moyen de fermer une fenêtre depuis la barre
    // disparaissait. Elle ne s'efface donc que sur un pointeur fin.
    expect(src).toMatch(/opacity-100 \[@media\(hover:hover\)\]:opacity-0/);
    expect(src).toMatch(/\[@media\(hover:hover\)\]:group-hover:opacity-100/);
  });

  it('le formulaire empile libellé et champ sur un volet étroit', () => {
    const src = lire('../FormulaireSage.tsx');
    // 158 + 12 + 210 = 380 px réclamés dans un volet de 152 : le champ était
    // comprimé à quelques pixels et le libellé se brisait mot par mot.
    expect(src).toMatch(/flex flex-col sm:flex-row items-stretch sm:items-start/);
    expect(src).toMatch(/w-full sm:w-\[158px\]/);
    expect(src).toMatch(/w-full sm:w-\[210px\]/);
    // Le rail d'onglets prenait la moitié de la fenêtre.
    expect(src).toMatch(/w-\[124px\] sm:w-\[172px\]/);
  });

  it("la porte d'ouverture empile son panneau de marque", () => {
    const src = lire('../../pages/AuthPage.tsx');
    // Fixé à 168 px sur un écran de 360, il ne laissait que 118 px au
    // formulaire, et 40 px au texte une fois les marges retirées.
    expect(src).toMatch(/flex flex-col sm:flex-row/);
    expect(src).toMatch(/w-full sm:w-\[168px\] sm:flex-shrink-0/);
  });

  it("la porte d'ouverture ne se réclame pas d'un seul référentiel", () => {
    const src = lire('../../pages/AuthPage.tsx');
    // Aucun dossier n'est ouvert à cet écran : le référentiel y est INCONNU.
    // Annoncer « entités à but non lucratif · SYCEBNL » mentait à tout dossier
    // SYSCOHADA (CLAUDE.md §6 : les deux référentiels ne partagent rien).
    expect(src).toContain('Comptabilité OHADA · SYCEBNL et SYSCOHADA');
    // La négation vise la LIGNE DE TEXTE affichée, pas la prose : le
    // commentaire qui explique l'incident cite forcément l'ancienne mention.
    expect(src).not.toMatch(/^\s*Comptabilité des entités à but non lucratif/m);
  });
});

/**
 * LE MENU « ÉTAT » NE DÉROULE PLUS VINGT-DEUX ÉDITIONS D'UN BLOC.
 *
 * Même famille de défaut que ci-dessus, et il se lit dans les classes : le
 * panneau s'ouvre en `top-full` sous une barre de menus qui, à 360 px, s'est
 * repliée sur deux rangs (≈ 82 px sous le haut de l'écran, barre de titre
 * comprise) alors que sa hauteur est plafonnée à `100dvh - 64px`. 82 étant
 * plus grand que 64, le bas du panneau tombe TOUJOURS sous le bord de
 * l'écran dès qu'il atteint son plafond, et son défilé interne n'y peut
 * rien : l'application est en `h-screen` `overflow-hidden`, la page ne
 * défile pas. Vingt-deux commandes à 22 px (`py-[3px]` + `leading-[16px]`)
 * font 484 px de liste ; repliée, elle en fait 154.
 *
 * Le repli est un ACCORDÉON, pas un menu volant · un sous-menu posé à droite
 * de son titre n'aurait nulle part où sortir sur un écran de 360 px, où le
 * panneau va déjà d'un bord à l'autre (`left-2 right-2`).
 */
describe('menu « État » à 360 px', () => {
  const shell = lire('AppShell.tsx');
  const source = shell.slice(shell.indexOf("titre: 'État',"), shell.indexOf("titre: 'Fenêtre',"));

  /**
   * Le menu relu depuis SA source · le spec ne recopie pas la liste, il la
   * déduit, comme ouverture-referentiel.spec.ts déduit du registre les
   * fenêtres réservées. Une édition ressortie de son groupe tombe donc ici.
   * L'indentation fait la profondeur : une commande de groupe est écrite à
   * douze espaces au moins, une commande directe à huit.
   */
  function menuEtat(): MenuEntreeDef[] {
    const entrees: MenuEntreeDef[] = [];
    let groupe: MenuGroupeDef | null = null;
    for (const ligne of source.split('\n')) {
      const titre = ligne.match(/^ {10}titre: '(.+)',$/);
      if (titre) {
        groupe = { titre: titre[1], items: [] };
        entrees.push(groupe);
        continue;
      }
      const commande = ligne.match(/^( +).*label: '([^']+)'/);
      if (!commande) continue;
      if (groupe && commande[1].length >= 12) groupe.items.push({ label: commande[2] });
      else entrees.push({ label: commande[2] });
    }
    return entrees;
  }

  const nom = (l: LigneMenu) => (l.sorte === 'groupe' ? l.groupe.titre : l.item.label);

  it('sept lignes au repos, là où il en déroulait vingt-deux', () => {
    // Le tableau de bord reste une entrée DIRECTE, en tête : c'est la seule
    // qui ne se mérite pas d'un dépliage.
    expect(lignesDuMenu(menuEtat(), null).map(nom)).toEqual([
      'Tableau de bord',
      'Livres comptables',
      'Analyse des comptes',
      'Suivi et prévision',
      'Contrôle et révision',
      'États financiers',
      'Fiscalité',
    ]);
  });

  it('les vingt-trois éditions restent atteignables, en onze lignes au plus', () => {
    const entrees = menuEtat();
    const groupes = entrees.filter((e): e is MenuGroupeDef => 'items' in e).map((g) => g.titre);
    const vues = new Set<string>();
    const hauteurs: number[] = [];
    for (const deplie of [null, ...groupes]) {
      const lignes = lignesDuMenu(entrees, deplie);
      hauteurs.push(lignes.length);
      for (const l of lignes) if (l.sorte === 'commande') vues.add(l.item.label);
    }
    // Rien n'a été perdu au regroupement · les vingt-trois libellés de la
    // source se retrouvent, chacun sous un groupe qu'on peut ouvrir. Le
    // décompte est EN DUR à dessein : c'est lui qui oblige à rouvrir ce test
    // quand une édition est ajoutée, et donc à revérifier que le panneau tient
    // toujours en onze lignes. Le vingt-troisième est le registre des
    // engagements de dépense, ajouté le 2026-09-05.
    const tous = [...source.matchAll(/label: '([^']+)'/g)].map((m) => m[1]);
    expect(tous).toHaveLength(23);
    expect([...vues].sort()).toEqual([...tous].sort());
    // Onze lignes = 242 px, quand le panneau en a 484 à tenir aujourd'hui.
    expect(Math.max(...hauteurs)).toBeLessThanOrEqual(11);
  });

  it("un groupe dont toutes les entrées sont masquées ne s'affiche pas vide", () => {
    // Les entrées du menu sont conditionnelles (référentiel du dossier,
    // droits, présence de cellules) · un titre muni d'une flèche qui ne
    // déplierait rien promet un contenu qui n'existe pas.
    const entrees: MenuEntreeDef[] = [{ label: 'Tableau de bord' }, { titre: 'Fiscalité', items: [] }];
    expect(lignesDuMenu(entrees, null).map(nom)).toEqual(['Tableau de bord']);
    expect(lignesDuMenu(entrees, 'Fiscalité').map(nom)).toEqual(['Tableau de bord']);
  });

  it("la balance agrégée reste réservée au dossier SYCEBNL qui a des cellules", () => {
    // Le regroupement ne doit pas avoir emporté la MOITIÉ de la condition ·
    // le module est monté sur le plan SYCEBNL, et un dossier sans cellule
    // n'a pas de groupe à agréger (cf. groupe.service.ts).
    expect(source).toMatch(
      /\.\.\.\(estSycebnl && \(utilisateur\?\.tenant\.nombreCellules \?\? 0\) > 0\n\s+\? \[\{ label: 'Balance agrégée du groupe'/,
    );
  });

  it('le repli se fait DANS le panneau, et un seul groupe à la fois', () => {
    const src = lire('MenuBar.tsx');
    // Le panneau rend la LISTE calculée, il ne refait pas le calcul : c'est
    // ce qui rend la règle exécutable dans ce spec plutôt que relisible.
    expect(src).toMatch(/lignesDuMenu\(m\.items, groupeDeplie\)/);
    // Un état qui porterait une collection laisserait ouvrir les six groupes
    // et rendrait au panneau les vingt-deux lignes qu'on lui retire.
    expect(src).toMatch(/const \[groupeDeplie, setGroupeDeplie\] = useState<string \| null>\(null\)/);
    // `left-full` / `right-full` sont l'ancrage d'un sous-menu VOLANT · à
    // 360 px il sortirait de l'écran, ce que le repli corrige justement.
    expect(src).not.toMatch(/left-full|right-full/);
  });

  it("le titre de groupe porte la petite flèche qui dit dans quel sens il va", () => {
    const src = lire('MenuBar.tsx');
    // Sans elle, un titre de groupe ne se distingue pas d'une commande : on
    // clique en croyant ouvrir une fenêtre, et le panneau change de forme.
    expect(src).toMatch(/\{ligne\.deplie \? '▾' : '▸'\}/);
    expect(src).toMatch(/aria-expanded=\{ligne\.deplie\}/);
  });
});
