/**
 * ÉCHAP SE DONNE À LA COUCHE LA PLUS HAUTE, ET À ELLE SEULE (audit final F177).
 *
 * Quatre écouteurs réagissaient à la même touche sur `document` · le menu, la
 * bulle d'aide, les modales et la fenêtre active. Échap sur un menu ouvert
 * fermait le menu ET la fenêtre derrière, et la pièce en cours partait avec.
 *
 * La règle tient en deux gestes. Une couche (menu, bulle, modale) écoute en
 * phase de CAPTURE, qui passe avant les écouteurs ordinaires du document, et
 * marque la touche consommée (`preventDefault`) quand elle a agi. La fenêtre,
 * elle, ne se ferme que sur une touche que personne n'a prise, et jamais
 * tant qu'une modale est ouverte · une modale qui ne gère pas Échap elle-même
 * ne doit pas laisser fermer la fenêtre sous elle.
 */

/**
 * Écoute Échap pour une couche. `agir` rend vrai quand la couche a réellement
 * agi (un menu fermé ne consomme rien) · la touche est alors marquée prise.
 */
export function ecouterEchap(agir: () => boolean): () => void {
  const surTouche = (e: KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (agir()) e.preventDefault();
  };
  document.addEventListener('keydown', surTouche, true);
  return () => document.removeEventListener('keydown', surTouche, true);
}

/** Marqueur que `PortailModale` pose autour de toute modale. */
export const ATTRIBUT_MODALE = 'data-modale';

export function modaleOuverte(): boolean {
  return document.querySelector(`[${ATTRIBUT_MODALE}]`) !== null;
}

/** Échap revient-il à la fenêtre active ? Ni prise par une couche, ni sous une modale. */
export function echapPourLaFenetre(e: KeyboardEvent): boolean {
  return e.key === 'Escape' && !e.defaultPrevented && !modaleOuverte();
}
