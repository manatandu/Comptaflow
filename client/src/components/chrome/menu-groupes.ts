/**
 * CE QU'UN MENU DÉROULANT AFFICHE · une commande, ou un GROUPE de commandes
 * replié sous son titre, que l'on déplie DANS le panneau.
 *
 * POURQUOI CE MODULE EXISTE, ET POURQUOI IL N'A PAS DE JSX.
 *
 * La règle qui borne la hauteur du panneau (un seul groupe déplié, un groupe
 * vide qui ne s'affiche pas) est une règle de LISTE, pas de rendu. Écrite
 * dans MenuBar.tsx elle ne serait vérifiable qu'en relisant sa source · le
 * dépôt n'embarque ni jsdom ni bibliothèque de rendu, et le jest de la racine
 * ne transforme que le `.ts` (clé `moduleFileExtensions` de package.json, où
 * « tsx » ne figure pas). Sortie ici, elle s'EXÉCUTE dans le spec au lieu de
 * s'y faire relire.
 */

export interface MenuItemDef {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Trait horizontal AVANT cet item · regroupe les commandes par famille, comme chez Sage. */
  separateurAvant?: boolean;
}

/**
 * Un repli, et NON un sous-menu volant. Un sous-menu qui sort sur le côté de
 * son titre reproduirait exactement le défaut que le repli corrige : à 360 px
 * la barre de menus se replie sur deux rangs, le panneau part déjà du bord
 * gauche de l'écran (voir `left-2 right-2` dans MenuBar.tsx), et un second
 * panneau posé à sa droite n'aurait nulle part où aller.
 */
export interface MenuGroupeDef {
  /** Titre du repli · les commandes du groupe s'affichent en retrait dessous. */
  titre: string;
  items: MenuItemDef[];
  separateurAvant?: boolean;
}

export type MenuEntreeDef = MenuItemDef | MenuGroupeDef;

export interface MenuDef {
  titre: string;
  items: MenuEntreeDef[];
}

export function estGroupe(entree: MenuEntreeDef): entree is MenuGroupeDef {
  return 'items' in entree;
}

/** Une ligne réellement posée dans le panneau, dans l'ordre du rendu. */
export type LigneMenu =
  | { sorte: 'commande'; item: MenuItemDef; retrait: boolean }
  | { sorte: 'groupe'; groupe: MenuGroupeDef; deplie: boolean };

/**
 * LA HAUTEUR DU PANNEAU TIENT ICI.
 *
 * `groupeDeplie` porte UN titre, jamais une collection : la signature
 * interdit d'en ouvrir deux, donc le panneau ne peut pas regagner la hauteur
 * qu'on vient de lui retirer. Chaque ligne mesure 22 px (`py-[3px]` +
 * `leading-[16px]` dans MenuBar.tsx) ; le menu « État », qui déroulait
 * vingt-deux commandes, en montre sept une fois replié et onze au plus quand
 * son plus gros groupe est ouvert.
 *
 * Un groupe VIDE ne produit aucune ligne · les entrées de menu sont
 * conditionnelles (référentiel du dossier, droits, présence de cellules), et
 * un titre muni d'une flèche qui ne déplierait rien serait pire qu'une
 * commande manquante : il promet un contenu.
 */
export function lignesDuMenu(entrees: MenuEntreeDef[], groupeDeplie: string | null): LigneMenu[] {
  const lignes: LigneMenu[] = [];
  for (const entree of entrees) {
    if (!estGroupe(entree)) {
      lignes.push({ sorte: 'commande', item: entree, retrait: false });
      continue;
    }
    if (entree.items.length === 0) continue;
    const deplie = entree.titre === groupeDeplie;
    lignes.push({ sorte: 'groupe', groupe: entree, deplie });
    if (deplie) {
      for (const item of entree.items) lignes.push({ sorte: 'commande', item, retrait: true });
    }
  }
  return lignes;
}
