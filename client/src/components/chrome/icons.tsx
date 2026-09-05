/**
 * Icônes SVG inline, tracé simple, cohérentes avec le canevas de design
 * validé · jamais d'emoji, jamais d'icon font.
 */
import type { SVGProps } from 'react';

const base = (props: SVGProps<SVGSVGElement>) => ({
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'square' as const,
  ...props,
});

export const IconDashboard = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 13h6V4H4v9zM14 20h6V4h-6v16zM4 20h6v-4H4v4z" /></svg>
);
export const IconSaisie = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconComptes = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 6h16M4 12h16M4 18h10" /></svg>
);
export const IconJournal = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 19.5A2.5 2.5 0 016.5 17H20V4H6.5A2.5 2.5 0 004 6.5v13z" /></svg>
);
export const IconEtats = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M14 3v5h5M6 3h8l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" /></svg>
);
export const IconRefresh = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 4v6h6M20 20v-6h-6M4 10a8 8 0 0114-5.3M20 14a8 8 0 01-14 5.3" /></svg>
);
export const IconExport = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 3v12M7 10l5 5 5-5M4 21h16" /></svg>
);
export const IconPrint = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-5a1 1 0 011-1h16a1 1 0 011 1v5a1 1 0 01-1 1h-2M6 14h12v7H6z" /></svg>
);
export const IconFilter = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 5h16l-6 8v6l-4-2v-4z" /></svg>
);
export const IconSearch = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
);
export const IconNew = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M20 6L9 17l-5-5" /></svg>
);
export const IconHome = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 11l9-7 9 7M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9" /></svg>
);
export const IconFileAdd = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M14 3v5h5M6 3h8l5 5v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5a2 2 0 012-2z" /><path d="M12 12v6M9 15h6" /></svg>
);
export const IconFolderOpen = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 7a1 1 0 011-1h4l2 2h10a1 1 0 011 1v9a1 1 0 01-1 1H4a1 1 0 01-1-1V7z" /></svg>
);
export const IconBook = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 19.5A2.5 2.5 0 016.5 17H20V4H6.5A2.5 2.5 0 004 6.5v13z" /></svg>
);
export const IconNews = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M7 8h10M7 12h10M7 16h6" /></svg>
);
export const IconLifeBuoy = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.2" /><path d="M6.3 6.3l3.4 3.4M14.3 14.3l3.4 3.4M17.7 6.3l-3.4 3.4M9.7 14.3l-3.4 3.4" /></svg>
);
export const IconInfo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.01" /></svg>
);
export const IconLock = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="5" y="11" width="14" height="9" rx="1.5" /><path d="M8 11V8a4 4 0 018 0v3" /></svg>
);
export const IconUsers = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="9" cy="8" r="3.2" /><path d="M3 20v-1.5A4.5 4.5 0 017.5 14h3A4.5 4.5 0 0115 18.5V20" /><circle cx="17" cy="9" r="2.6" /><path d="M15.5 14.2A4 4 0 0121 18v2" /></svg>
);
/** Balance (l'état) · deux plateaux. */
export const IconBalance = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 4v16M8 20h8M12 6l-6 2m6-2l6 2M6 8l-2.5 6a3 3 0 005 0L6 8zM18 8l-2.5 6a3 3 0 005 0L18 8z" /></svg>
);
/** Banque / rapprochement bancaire · fronton à colonnes. */
export const IconBanque = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 9l9-5 9 5M4 9h16M6 9v8M10 9v8M14 9v8M18 9v8M4 17h16M3 20h18" /></svg>
);
/** Immobilisation · machine/bâtiment stylisé. */
export const IconImmo = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M3 20h18M5 20V9h6v11M11 13h8v7M8 12v.01M8 16v.01M14 16h2" /></svg>
);
/** Grille de saisie · tableau à lignes et colonnes. */
export const IconGrille = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="3" y="4" width="18" height="16" rx="1" /><path d="M3 9h18M3 14h18M9 4v16" /></svg>
);

/* ---------------------------------------------------------------------------
 * ACTIONS DE LA BARRE D'OUTILS · les verbes de Sage 100 i7 (Ajouter,
 * Consulter, Voir/Modifier, Supprimer, Rechercher, Atteindre, Inverseur,
 * Calculette, Trier). Ils agissent sur l'enregistrement courant de la fenêtre
 * active, pas sur la navigation · voir lib/actions-fenetre.tsx.
 * ------------------------------------------------------------------------ */

/** Ajouter · le « + » de Sage. */
export const IconAjouter = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M12 5v14M5 12h14" /></svg>
);
/** Consulter · la loupe pleine de Sage, lecture seule. */
export const IconConsulter = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="6" /><path d="M15.5 15.5L21 21" /></svg>
);
/** Voir/Modifier · le crayon. */
export const IconModifier = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M14.5 5.5l4 4" /></svg>
);
/** Supprimer · la croix de Sage, et non une corbeille : Sage barre. */
export const IconSupprimer = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6L6 18" /></svg>
);
/** Rechercher · loupe avec manche, distincte de Consulter. */
export const IconRechercher = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><circle cx="10.5" cy="10.5" r="5.5" /><path d="M14.5 14.5L20 20" /><path d="M8 10.5h5" /></svg>
);
/** Atteindre · aller directement à un enregistrement (flèche vers une butée). */
export const IconAtteindre = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 12h12M12 7l5 5-5 5M20 5v14" /></svg>
);
/** Inverseur · échange débit et crédit (deux flèches opposées). */
export const IconInverseur = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 8h13l-3-3M20 16H7l3 3" /></svg>
);
/** Calculette Sage. */
export const IconCalculette = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M16 15h0M8 18h6" /></svg>
);
/** Trier · trois barres décroissantes, comme le « Trier » de Sage. */
export const IconTrier = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M4 7h16M6 12h12M9 17h6" /></svg>
);
/**
 * Cloche · la file des courriels sortants. Tracé simple, comme les autres :
 * un contour de cloche et son battant, sans remplissage · c'est la pastille
 * de compte qui doit attirer l'œil, pas l'icône.
 */
export const IconCloche = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}><path d="M6 16V10a6 6 0 1112 0v6l1.5 2.5h-15L6 16z" /><path d="M10 21h4" /></svg>
);
