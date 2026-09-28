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

// Générique plutôt que `FenetreOuverte` · ce module se charge aussi sous le
// jest de la racine, qui ne compile pas le JSX de `fenetres.tsx`.
type Fermable = { cle: string; enFermeture?: boolean };

export function marquerFermeture<T extends Fermable>(fenetres: T[], cle: string): T[] {
  return fenetres.map((f) => (f.cle === cle ? { ...f, enFermeture: true } : f));
}

export function retirerSiEnFermeture<T extends Fermable>(fenetres: T[], cle: string): T[] {
  return fenetres.filter((f) => !(f.cle === cle && f.enFermeture));
}

export function mouvementReduit(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}
