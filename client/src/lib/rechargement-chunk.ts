/**
 * LE RECHARGEMENT APRÈS UN DÉPLOIEMENT, ET LE GARDE-FOU QUI L'EMPÊCHE DE
 * BOUCLER (audit final F246).
 *
 * Les pages sont chargées à la demande (morceaux hachés) et Firebase ne sert
 * plus ceux de la version précédente : la première fenêtre ouverte après un
 * déploiement reçoit un module introuvable, que Vite signale par
 * `vite:preloadError`. Recharger UNE fois ramène l'index neuf et ses morceaux.
 *
 * Le marqueur posé avant le rechargement était EFFACÉ à chaque `load` · or la
 * page rechargée déclenche justement un `load`, si bien que le marqueur
 * n'existait plus au moment où il devait servir. Un morceau qui manque encore
 * après le rechargement (déploiement incomplet, réseau qui coupe) relançait
 * un rechargement, puis un autre, sans fin, et l'erreur ne s'affichait jamais.
 *
 * Le marqueur est désormais DATÉ, et il n'est plus effacé : il n'autorise
 * qu'un rechargement par fenêtre de temps. Passé ce délai, un déploiement
 * suivant dans la même session peut de nouveau recharger, ce que l'effacement
 * au `load` cherchait à permettre.
 */
export const CLE_RECHARGEMENT_CHUNK = 'omegax:rechargement-chunk';

/**
 * Cinq minutes · convention d'OmegaX, aucun texte ne la fixe. Assez longue
 * pour qu'un second échec de la page rechargée, même sur une liaison lente,
 * tombe dans l'intervalle et s'affiche au lieu de relancer ; assez courte
 * pour qu'un second déploiement dans la journée recharge encore de lui-même.
 */
export const FENETRE_RECHARGEMENT_MS = 5 * 60_000;

/**
 * Faut-il autoriser un rechargement, vu le marqueur lu ? Fonction PURE.
 *
 * Un marqueur absent autorise. Un marqueur illisible (une valeur retouchée),
 * ancien (l'ancien « 1 » se lit comme une date de 1970) ou posé dans le
 * futur (horloge du poste reculée) autorise aussi · il est aussitôt remplacé
 * par une date juste, qui bornera la tentative suivante, et le garde-fou
 * reprend. Seul un marqueur récent, donc posé par un rechargement de
 * l'intervalle, refuse.
 */
export function peutRecharger(
  marqueur: string | null,
  maintenant: number,
  fenetreMs: number = FENETRE_RECHARGEMENT_MS,
): boolean {
  if (marqueur === null) return true;
  const pose = Number(marqueur);
  if (!Number.isFinite(pose) || pose > maintenant) return true;
  return maintenant - pose >= fenetreMs;
}

/** La part du stockage de session dont la décision a besoin. */
export type StockageMarqueur = Pick<Storage, 'getItem' | 'setItem'>;

/**
 * Décide du rechargement ET pose le marqueur daté. Rend VRAI seulement quand
 * le marqueur est posé et relu · sans lui, rien ne bornerait la tentative
 * suivante, et c'est la boucle que ce garde-fou existe pour empêcher.
 *
 * Le stockage s'obtient par une fonction · y accéder jette déjà dans une
 * fenêtre privée ou quand le navigateur bloque le stockage, et tout échec
 * vaut refus : l'erreur de chargement s'affiche, l'utilisateur recharge à la
 * main, ce qui vaut mieux qu'une page qui se recharge sans fin.
 */
export function autoriserRechargement(obtenirStockage: () => StockageMarqueur, maintenant: number): boolean {
  try {
    const stockage = obtenirStockage();
    if (!peutRecharger(stockage.getItem(CLE_RECHARGEMENT_CHUNK), maintenant)) return false;
    const date = String(maintenant);
    stockage.setItem(CLE_RECHARGEMENT_CHUNK, date);
    // Relu · un stockage qui accepte l'écriture sans la garder ne borne rien.
    return stockage.getItem(CLE_RECHARGEMENT_CHUNK) === date;
  } catch {
    return false;
  }
}
