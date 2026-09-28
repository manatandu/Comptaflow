import type { FenetreOuverte } from './fenetres';

/**
 * FERMETURE ANIMÉE D'UNE FENÊTRE · « où est passée cette fenêtre ? ». La
 * fenêtre est d'abord MARQUÉE (`enFermeture`), joue sa sortie, puis se
 * retire. Trois règles.
 *  1. LA GARDE DU TRAVAIL NON ENREGISTRÉ PASSE AVANT · on ne marque qu'une
 *     fenêtre dont la fermeture est déjà confirmée (`fermer`, `lib/fenetres`).
 *  2. RETIRER NE RETIRE QU'UNE FENÊTRE ENCORE EN FERMETURE · rouverte pendant
 *     sa sortie, elle est rendue (`ouvrir` lève la marque) et ne doit pas
 *     disparaître à la fin du délai.
 *  3. SOUS `prefers-reduced-motion`, aucun délai · la fenêtre part aussitôt.
 */
export const DUREE_FERMETURE_MS = 140;

export function marquerFermeture(fenetres: FenetreOuverte[], cle: string): FenetreOuverte[] {
  return fenetres.map((f) => (f.cle === cle ? { ...f, enFermeture: true } : f));
}

export function retirerSiEnFermeture(fenetres: FenetreOuverte[], cle: string): FenetreOuverte[] {
  return fenetres.filter((f) => !(f.cle === cle && f.enFermeture));
}

export function mouvementReduit(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
