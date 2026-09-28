/**
 * AUDIT FINAL F259 · LES LISTES DU REGISTRE DU PERSONNEL SONT BORNÉES.
 *
 * Le serveur rend une tranche des salariés, de la confrontation, des
 * rubriques, des bulletins modèles et des avances, et DIT quand elle ne
 * couvre pas tout (`total` compté par la base, `tronque`, CLAUDE.md § 8
 * bis). L'écran le répète · « 500 » ne doit jamais se lire comme le nombre
 * d'éléments du dossier. Ce ne sont que des listes de TRAVAIL, jamais un
 * document · aucune période ne se resserre ici, d'où une phrase propre et non
 * `libelleTranche` des listes datées.
 *
 * `null` quand la liste est entière.
 */
export function libelleListeBornee(r: { total: number; tronque: boolean }, affiches: number, nom: string): string | null {
  return r.tronque ? `Liste tronquée · ${affiches} sur ${r.total} ${nom}.` : null;
}
