/**
 * LES LISTES DE LA CONSOLE SONT DES TRANCHES QUI SE DISENT (audit final F260).
 *
 * Cabinets, abonnements et licences sur site se lisaient sans borne · une
 * console d'éditeur n'a pas de dossier pour la limiter, et chaque cabinet de
 * plus alourdissait l'écran et la requête qui le sert. Ce sont des écrans de
 * TRAVAIL, pas des documents (CLAUDE.md § 8 bis) · ils peuvent ne montrer
 * qu'une tranche, à condition de le DIRE · `total` est compté par la base sur
 * le périmètre entier, et `tronque` avertit quand la liste en rend moins.
 *
 * Cinq cents, la borne des autres fenêtres de travail (file des courriers,
 * historique des rappels).
 */
export const PLAFOND_LISTE_CONSOLE = 500;

/** Une liste de la console, sa tranche et ce qu'elle ne montre pas. */
export interface TrancheConsole {
  total: number;
  tronque: boolean;
  plafond: number;
}

/** Les trois champs de la tranche, pris sur le total compté par la base. */
export function tranche(rendus: number, total: number): TrancheConsole {
  return { total, tronque: total > rendus, plafond: PLAFOND_LISTE_CONSOLE };
}
