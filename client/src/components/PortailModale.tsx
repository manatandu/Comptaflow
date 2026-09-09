import { createPortal } from 'react-dom';

/**
 * UNE MODALE SE POSE SUR L'ÉCRAN, PAS DANS LA BARRE QUI L'A OUVERTE.
 *
 * Le défaut, mesuré au navigateur avant d'être corrigé : la calculette ouverte
 * depuis la barre de menus sortait de l'écran PAR LE HAUT, sommet à -105 px,
 * là où aucune barre de défilement ne va la chercher.
 *
 * `position: fixed` ne se résout pas toujours sur la fenêtre du navigateur.
 * Un ancêtre qui porte `filter`, `backdrop-filter`, `transform`, `perspective`
 * ou `contain: paint` devient le BLOC CONTENEUR de ses descendants fixes. La
 * barre de menus porte `backdrop-blur-md` (le verre dépoli du chrome, chantier
 * de la maquette Windows 11) : `inset-0` s'y résolvait donc sur une barre de
 * 26 px au lieu de l'écran, et `items-center` centrait une calculette de
 * 302 px sur ces 26 px · 138 px passaient au-dessus du bord.
 *
 * Le dossier connaissait déjà l'autre moitié de la règle · le commentaire de
 * MenuBar note que « backdrop-blur crée un contexte d'empilement sur cette
 * barre ». C'est le même mot-clef qui crée le bloc conteneur, et c'est cette
 * moitié-là qui manquait.
 *
 * CE QUI EST REFUSÉ ICI, ET POURQUOI · retirer le flou des barres corrigerait
 * le symptôme en défaisant un parti pris de maquette, et ne protégerait de
 * rien : le prochain `transform` posé sur un ancêtre rouvrirait le même trou,
 * en silence. Le portail rend la modale INDÉPENDANTE de l'endroit d'où elle
 * est appelée, ce qui est de toute façon ce qu'une modale veut dire.
 *
 * Le `<body>` plutôt qu'un noeud dédié : il ne porte aucune de ces propriétés,
 * et n'a pas à en porter · c'est la racine de la page.
 */
export function PortailModale({ children }: { children: React.ReactNode }) {
  return createPortal(children, document.body);
}
