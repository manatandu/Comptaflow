import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
